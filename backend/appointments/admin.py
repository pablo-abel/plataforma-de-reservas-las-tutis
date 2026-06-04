from django.contrib import admin
from .models import Appointment


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
  list_display = ("id", "name", "email", "starts_at", "duration_minutes", "status", "created_at")
  list_filter = ("status", "starts_at", "created_at")
  search_fields = ("name", "email", "comment")

# Register your models here.
