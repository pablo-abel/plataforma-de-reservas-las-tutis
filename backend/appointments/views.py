from datetime import datetime, time, timedelta

from django.utils import timezone
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.core.mail import send_mail
from django.conf import settings

from .models import Appointment
from .serializers import AppointmentSerializer, ContactSerializer


# Parámetros de configuración de la agenda y grilla de turnos
SLOT_MINUTES = 60
OPEN_TIME = time(10, 0)
CLOSE_TIME = time(18, 0)
BUFFER_MINUTES = 15
CAPACITY = 1
MIN_ADVANCE_HOURS = 12


def _generate_slots_for_date(date_obj):
    """
    Genera una lista de objetos datetime conscientes de la zona horaria (timezone-aware)
    que representan los bloques o intervalos de turnos disponibles en una fecha dada.
    
    Se basa en las constantes del sistema:
    - OPEN_TIME: Hora de apertura de la peluquería.
    - CLOSE_TIME: Hora de cierre de la peluquería.
    - SLOT_MINUTES: Duración de cada turno.
    """
    start_dt = timezone.make_aware(datetime.combine(date_obj, OPEN_TIME))
    end_dt = timezone.make_aware(datetime.combine(date_obj, CLOSE_TIME))
    slots = []
    current = start_dt
    while current + timedelta(minutes=SLOT_MINUTES) <= end_dt:
        slots.append(current)
        current += timedelta(minutes=SLOT_MINUTES)
    return slots


def _is_slot_available(slot_dt):
    """
    Determina si un horario específico está disponible, asegurándose de que:
    1. No supere la capacidad máxima de turnos simultáneos (CAPACITY).
    2. Se respete el margen de tiempo (BUFFER_MINUTES) antes y después
       de cualquier otro turno ya agendado que no esté cancelado.
    """
    slot_end = slot_dt + timedelta(minutes=SLOT_MINUTES)
    # consider buffer both sides
    window_start = slot_dt - timedelta(minutes=BUFFER_MINUTES)
    window_end = slot_end + timedelta(minutes=BUFFER_MINUTES)
    overlaps = Appointment.objects.filter(
        Q(starts_at__lt=window_end) & Q(starts_at__gte=window_start)
    ).exclude(status=Appointment.Status.CANCELLED)
    return overlaps.count() < CAPACITY


@api_view(["GET"])
def available_slots(request):
    """
    Endpoint público:
    Obtiene los horarios (slots) disponibles para una fecha seleccionada.
    Valida que la fecha tenga formato válido, no coincida con días no laborables,
    y que los turnos generados cumplan con el margen de anticipación mínima requerida (MIN_ADVANCE_HOURS).
    """
    date_str = request.query_params.get("date")
    if not date_str:
        return Response({"detail": "Missing date=YYYY-MM-DD"}, status=400)
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return Response({"detail": "Invalid date format"}, status=400)

    # non-working weekdays
    if getattr(settings, 'NON_WORKING_WEEKDAYS', set()) and date_obj.weekday() in settings.NON_WORKING_WEEKDAYS:
        return Response({"date": date_str, "slots": []})

    # enforce minimum advance
    now = timezone.now()
    min_dt = now + timedelta(hours=MIN_ADVANCE_HOURS)

    slots = _generate_slots_for_date(date_obj)
    result = []
    for s in slots:
        if s >= min_dt and _is_slot_available(s):
            result.append(s.isoformat())

    return Response({"date": date_str, "slots": result})


@api_view(["POST"])
def create_appointment(request):
    """
    Endpoint público:
    Crea una solicitud de turno desde la Landing Page.
    Realiza validaciones completas:
    1. Límite de 3 turnos diarios por correo para prevenir spam.
    2. Rechazo de días no laborables configurados.
    3. Margen mínimo de anticipación de 12 horas.
    4. El horario debe coincidir con la grilla de turnos disponible.
    5. Disponibilidad del turno (no solapamiento de horarios).
    Notifica automáticamente al dueño por correo electrónico al crearse.
    """
    serializer = AppointmentSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    starts_at = serializer.validated_data["starts_at"]
    date_obj = starts_at.astimezone(timezone.get_current_timezone()).date()
    email = serializer.validated_data["email"]

    # Check daily limit per email (max 3 appointments per day)
    today_start = timezone.make_aware(datetime.combine(date_obj, time.min))
    today_end = timezone.make_aware(datetime.combine(date_obj, time.max))
    daily_count = Appointment.objects.filter(
        email=email,
        starts_at__gte=today_start,
        starts_at__lte=today_end
    ).exclude(status=Appointment.Status.CANCELLED).count()

    if daily_count >= 3:
        return Response({
            "detail": "Ya alcanzaste el límite de 3 turnos por día. Intentá mañana."
        }, status=429)

    # reject non-working weekdays
    if getattr(settings, 'NON_WORKING_WEEKDAYS', set()) and date_obj.weekday() in settings.NON_WORKING_WEEKDAYS:
        return Response({"detail": "No hay turnos disponibles ese día."}, status=400)

    # enforce minimum advance
    if starts_at < timezone.now() + timedelta(hours=MIN_ADVANCE_HOURS):
        return Response({"detail": "El turno debe pedirse con al menos 12h de anticipación."}, status=400)

    # enforce slot grid: starts_at must match generated slots
    valid_slots = _generate_slots_for_date(date_obj)
    if not any(abs((starts_at - s).total_seconds()) < 1 for s in valid_slots):
        return Response({"detail": "El horario elegido no coincide con un turno disponible."}, status=400)

    # check slot availability
    if not _is_slot_available(starts_at):
        return Response({"detail": "Ese horario ya no está disponible."}, status=409)

    appt = Appointment.objects.create(
        name=serializer.validated_data["name"],
        email=serializer.validated_data["email"],
        starts_at=starts_at,
        duration_minutes=serializer.validated_data.get("duration_minutes", SLOT_MINUTES),
        comment=serializer.validated_data.get("comment", ""),
        status=Appointment.Status.PENDING,
    )

    # Notify owner by email (console backend by default in dev)
    try:
        subject = "Nuevo pedido de turno"
        message = (
            f"Nombre: {appt.name}\n"
            f"Email: {appt.email}\n"
            f"Fecha/Hora: {appt.starts_at.strftime('%Y-%m-%d %H:%M %z')}\n"
            f"Duración: {appt.duration_minutes} minutos\n"
            f"Comentario: {appt.comment or '-'}\n"
            f"Estado: {appt.status}\n"
        )
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [getattr(settings, 'OWNER_EMAIL', 'owner@example.com')],
            fail_silently=True,
        )
    except Exception:
        pass

    return Response(AppointmentSerializer(appt).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_appointments(request):
    """
    Endpoint privado (Solo Administradores):
    Lista todas las solicitudes de turnos en el sistema en orden cronológico inverso.
    Soporta filtrado opcional mediante el parámetro de consulta ?status=.
    """
    status_filter = request.query_params.get("status")
    qs = Appointment.objects.all().order_by("-starts_at")
    if status_filter:
        qs = qs.filter(status=status_filter)
    data = AppointmentSerializer(qs, many=True).data
    return Response(data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_appointment(request, pk: int):
    """
    Endpoint privado (Solo Administradores):
    Permite modificar parcialmente un turno (comentarios o estado: pendiente, aprobado, cancelado).
    Si el estado cambia a Aprobado o Cancelado, se despacha un correo electrónico automático
    notificando de forma personalizada y en español al cliente.
    """
    try:
        appt = Appointment.objects.get(pk=pk)
    except Appointment.DoesNotExist:
        return Response({"detail": "No encontrado"}, status=404)

    # Permitir actualizar estado y comentario solamente desde el panel admin simple
    allowed = {}
    new_status = request.data.get("status")
    if new_status in [c[0] for c in Appointment.Status.choices]:
        allowed["status"] = new_status
    if "comment" in request.data:
        allowed["comment"] = request.data.get("comment") or ""

    old_status = appt.status
    for k, v in allowed.items():
        setattr(appt, k, v)
    appt.save()

    # Notificar al cliente sobre el cambio de estado (aprobado o cancelado)
    if "status" in allowed and allowed["status"] != old_status:
        try:
            subject = ""
            message = ""
            date_local = appt.starts_at.astimezone(timezone.get_current_timezone())
            formatted_date = date_local.strftime('%d/%m/%Y a las %H:%M hs')

            if appt.status == Appointment.Status.APPROVED:
                subject = "Tu turno en Las Tutis esta confirmado"
                message = (
                    f"Hola {appt.name}:\n\n"
                    f"Nos alegra contarte que tu solicitud de turno en Peluquería Canina 'Las Tutis' ha sido CONFIRMADA de forma exitosa.\n\n"
                    f"Fecha y Hora: {formatted_date}\n"
                    f"Comentario del turno: {appt.comment or 'Sin comentarios adicionales'}\n\n"
                    f"Te esperamos con muchas ganas junto a tu mascota. Si necesitas reprogramar o cancelar, por favor escribinos con la mayor anticipación posible.\n\n"
                    f"Muchas gracias por elegirnos.\n\n"
                    f"Las Tutis"
                )
            elif appt.status == Appointment.Status.CANCELLED:
                subject = "Actualizacion sobre tu turno en Las Tutis"
                message = (
                    f"Hola {appt.name}:\n\n"
                    f"Lamentamos informarte que tuvimos que cancelar tu solicitud de turno programada para el dia {formatted_date}.\n\n"
                    f"Te pedimos disculpas por el inconveniente. Podes volver a ingresar a nuestra pagina web para elegir otro de los horarios disponibles, o comunicarte directamente con nosotros via WhatsApp al +54 9 11 5555-5555.\n\n"
                    f"Muchas gracias por entender.\n\n"
                    f"Las Tutis"
                )

            if subject and message:
                send_mail(
                    subject,
                    message,
                    settings.DEFAULT_FROM_EMAIL,
                    [appt.email],
                    fail_silently=False,
                )
        except Exception:
            pass

    return Response(AppointmentSerializer(appt).data)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_appointment(request, pk: int):
    """
    Endpoint privado (Solo Administradores):
    Elimina físicamente un turno de la base de datos de manera irreversible.
    """
    try:
        appt = Appointment.objects.get(pk=pk)
    except Appointment.DoesNotExist:
        return Response({"detail": "No encontrado"}, status=404)
    appt.delete()
    return Response(status=204)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def admin_create_appointment(request):
    """
    Endpoint para administradores: crea turnos sin las restricciones
    de días no laborables, grilla horaria y anticipo mínimo.
    """
    serializer = AppointmentSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    starts_at = serializer.validated_data["starts_at"]
    
    # Para administradores, solo validamos el solapamiento del turno
    if _is_slot_available(starts_at):
        appt = serializer.save(status=Appointment.Status.APPROVED)  # Auto-aprobar turnos de admin
        return Response(AppointmentSerializer(appt).data, status=status.HTTP_201_CREATED)
    else:
        return Response(
            {"detail": "El horario seleccionado está ocupado por otro turno."},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def contact_view(request):
    """
    Endpoint público para recibir mensajes de contacto.
    Valida los datos y envía una notificación por correo electrónico.
    """
    serializer = ContactSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    name = serializer.validated_data["name"]
    email = serializer.validated_data["email"]
    message = serializer.validated_data["message"]

    subject = f"Mensaje de Consulta Web - Las Tutis ({name})"
    email_content = (
        f"Se ha registrado una nueva consulta desde el portal web de Las Tutis:\n\n"
        f"Nombre: {name}\n"
        f"Email: {email}\n\n"
        f"Mensaje:\n{message}\n"
    )

    try:
        send_mail(
            subject=subject,
            message=email_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[getattr(settings, "OWNER_EMAIL", "owner@example.com")],
            fail_silently=False,
        )
    except Exception as e:
        # En caso de error de correo (ej: servidor SMTP mal configurado),
        # devolvemos un 500 pero registramos el error para no colgar la app.
        return Response(
            {"detail": "No se pudo enviar el mensaje debido a un problema con el servidor de correo."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return Response({"detail": "¡Mensaje enviado con éxito! Nos comunicaremos pronto."})

