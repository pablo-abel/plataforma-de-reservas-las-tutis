from rest_framework import serializers
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from .models import Appointment

class AppointmentSerializer(serializers.ModelSerializer):
    """
    Serializador para el modelo de Turnos (Appointment).
    Valida y da formato a los campos para el agendamiento público y la administración.
    Limita el comentario de forma segura a un máximo de 500 caracteres.
    """
    comment = serializers.CharField(max_length=500, required=False, allow_blank=True)

    class Meta:
        model = Appointment
        fields = [
            'id', 'name', 'email', 'starts_at', 'duration_minutes', 'comment', 'status', 'created_at'
        ]
        read_only_fields = ['id', 'status', 'created_at']

class LoginSerializer(serializers.Serializer):
    """
    Serializador para gestionar el proceso de inicio de sesión administrativo.
    Valida las credenciales del usuario y comprueba que tenga permisos de staff (administrador).
    """
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        """
        Valida que el usuario exista, esté activo y sea administrador (is_staff).
        """
        username = data.get('username')
        password = data.get('password')

        if username and password:
            user = authenticate(username=username, password=password)
            if not user:
                raise serializers.ValidationError('Credenciales inválidas')
            if not user.is_active:
                raise serializers.ValidationError('Usuario inactivo')
            if not user.is_staff:
                raise serializers.ValidationError('Acceso denegado: se requiere permisos de administrador')
            data['user'] = user
        else:
            raise serializers.ValidationError('Debe incluir username y password')
        return data

class ContactSerializer(serializers.Serializer):
    """
    Serializador para validar los mensajes de consulta enviados desde el
    formulario de contacto público en la landing page.
    """
    name = serializers.CharField(max_length=120)
    email = serializers.EmailField()
    message = serializers.CharField(max_length=2000)

