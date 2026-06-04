from django.db import models


class Appointment(models.Model):
    """
    Modelo que representa un Turno reservado en el sistema "Las Tutis".
    Contiene la información de contacto del cliente, los detalles del perrito,
    el horario del turno y el estado de moderación/confirmación.
    """

    class Status(models.TextChoices):
        """
        Clase de opciones que define los posibles estados de un turno.
        - PENDING: Turno solicitado por el cliente, pendiente de aprobación por el administrador.
        - APPROVED: Turno confirmado por el administrador.
        - CANCELLED: Turno rechazado/cancelado por el administrador o el cliente.
        """
        PENDING = "pending", "Pendiente"
        APPROVED = "approved", "Aprobado"
        CANCELLED = "cancelled", "Cancelado"

    name = models.CharField(
        max_length=120,
        help_text="Nombre del cliente o dueño de la mascota."
    )
    email = models.EmailField(
        help_text="Correo electrónico de contacto."
    )
    starts_at = models.DateTimeField(
        help_text="Fecha y hora de inicio del turno reservado."
    )
    duration_minutes = models.PositiveIntegerField(
        default=60,
        help_text="Duración estimada del turno en minutos."
    )
    comment = models.TextField(
        blank=True,
        help_text="Notas especiales del turno (raza, alergias, comportamiento)."
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        help_text="Estado actual de la solicitud del turno."
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Fecha de creación del registro en el sistema."
    )

    class Meta:
        ordering = ["-starts_at"]  # Listar por defecto desde los más futuros/recientes

    def __str__(self):
        """
        Representación legible por humanos de la instancia del turno.
        """
        return f"{self.name} - {self.starts_at:%Y-%m-%d %H:%M} ({self.status})"
