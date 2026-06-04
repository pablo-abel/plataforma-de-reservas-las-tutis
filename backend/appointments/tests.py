from datetime import datetime, timedelta, time
from django.utils import timezone
from django.core import mail
from django.conf import settings
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth.models import User
from .models import Appointment

class AppointmentAPITests(APITestCase):
    """
    Suite de pruebas unitarias e integración automatizadas para la API de turnos.
    Verifica las reglas críticas de negocio: anticipación, spam, solapamientos y días libres.
    """

    def setUp(self):
        # Crear un usuario administrador para pruebas privadas
        self.admin_user = User.objects.create_superuser(
            username="admin_test",
            email="admin@test.com",
            password="securepassword123"
        )
        
        # Forzar un lunes futuro para asegurar que sea un día hábil y evitar el límite de 12 horas
        now = timezone.now()
        days_ahead = 7 - now.weekday()  # Próximo lunes
        if days_ahead <= 0:
            days_ahead += 7
        
        # Lunes a las 12:00 hs (futuro)
        self.base_date = (now + timedelta(days=days_ahead)).date()
        self.test_slot = timezone.make_aware(datetime.combine(self.base_date, time(12, 0)))
        
        # Limpiar bandeja de salida de correos de prueba
        mail.outbox.clear()

    def test_create_appointment_success(self):
        """Verifica que se pueda agendar un turno válido y se genere un correo para el administrador."""
        payload = {
            "name": "Carlos Gomez",
            "email": "carlos@example.com",
            "starts_at": self.test_slot.isoformat(),
            "comment": "Corte de pelo y baño"
        }
        res = self.client.post("/api/appointments/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Appointment.objects.count(), 1)
        
        # Verificar notificación por correo en memoria (outbox)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Nuevo pedido de turno", mail.outbox[0].subject)

    def test_create_appointment_spam_prevention(self):
        """Verifica el límite estricto de máximo 3 turnos diarios por cuenta de correo."""
        # Agendamos 3 turnos válidos espaciados en horas distintas del mismo día
        for h in [10, 11, 14]:
            slot = timezone.make_aware(datetime.combine(self.base_date, time(h, 0)))
            Appointment.objects.create(
                name="Cliente Recurrente",
                email="spam@example.com",
                starts_at=slot,
                status=Appointment.Status.APPROVED
            )

        # El 4to intento en el mismo día debe ser rechazado (status 429)
        fourth_slot = timezone.make_aware(datetime.combine(self.base_date, time(16, 0)))
        payload = {
            "name": "Cliente Recurrente",
            "email": "spam@example.com",
            "starts_at": fourth_slot.isoformat()
        }
        res = self.client.post("/api/appointments/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("límite de 3 turnos", res.data["detail"])

    def test_create_appointment_insufficient_advance(self):
        """Rechaza reservas que no cumplan con el mínimo de 12 horas de anticipación."""
        # Un slot a solo 2 horas en el futuro
        invalid_slot = timezone.now() + timedelta(hours=2)
        payload = {
            "name": "Apurado",
            "email": "apurado@example.com",
            "starts_at": invalid_slot.isoformat()
        }
        res = self.client.post("/api/appointments/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("12h de anticipación", res.data["detail"])

    def test_create_appointment_non_working_day(self):
        """Rechaza reservas en días no laborables configurados en settings (ej. Miércoles/Jueves)."""
        # Calcular el próximo miércoles de prueba (weekday = 2)
        now = timezone.now()
        days_to_wed = (2 - now.weekday()) % 7
        if days_to_wed == 0:
            days_to_wed = 7
        wed_date = (now + timedelta(days=days_to_wed)).date()
        wed_slot = timezone.make_aware(datetime.combine(wed_date, time(12, 0)))

        # Forzar en configuración que Miércoles (2) sea no laborable
        with self.settings(NON_WORKING_WEEKDAYS={2, 3}):
            payload = {
                "name": "Cliente Feriado",
                "email": "feriado@example.com",
                "starts_at": wed_slot.isoformat()
            }
            res = self.client.post("/api/appointments/", payload, format="json")
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("No hay turnos disponibles", res.data["detail"])

    def test_create_appointment_overlap_prevention(self):
        """Previene el solapamiento de turnos que interfieran en el mismo horario + buffer."""
        # Crear un turno confirmado a las 12:00 hs
        Appointment.objects.create(
            name="Cliente A",
            email="clientea@example.com",
            starts_at=self.test_slot,
            status=Appointment.Status.APPROVED
        )

        # Intentar agendar en el mismo horario exacto (ya ocupado)
        overlap_slot = self.test_slot
        payload = {
            "name": "Cliente B",
            "email": "clienteb@example.com",
            "starts_at": overlap_slot.isoformat()
        }
        res = self.client.post("/api/appointments/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("ya no está disponible", res.data["detail"])

    def test_admin_update_status_and_notify(self):
        """Verifica que el panel administrativo pueda cambiar el estado y dispare un mail en español al cliente."""
        # Crear turno en estado pendiente
        appt = Appointment.objects.create(
            name="Juana Diaz",
            email="juana@example.com",
            starts_at=self.test_slot,
            status=Appointment.Status.PENDING
        )

        # Autenticamos al administrador en el cliente de prueba API
        self.client.force_authenticate(user=self.admin_user)

        # Cambiamos estado a Confirmado (approved)
        payload = {"status": "approved"}
        res = self.client.patch(f"/api/appointments/admin/{appt.id}/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        # Recargar de base de datos
        appt.refresh_from_db()
        self.assertEqual(appt.status, Appointment.Status.APPROVED)

        # Comprobar el envío del mail personalizado en español al cliente
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["juana@example.com"])
        self.assertIn("confirmado", mail.outbox[0].subject)
        self.assertIn("CONFIRMADA de forma exitosa", mail.outbox[0].body)
