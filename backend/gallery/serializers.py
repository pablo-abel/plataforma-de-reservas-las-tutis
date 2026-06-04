from rest_framework import serializers
from .models import HaircutImage

class HaircutImageSerializer(serializers.ModelSerializer):
    """
    Serializador para el modelo de imágenes de la galería.
    Valida y expone de forma segura los atributos en formato JSON.
    """
    class Meta:
        model = HaircutImage
        fields = ['id', 'image', 'alt_text', 'created_at']
        read_only_fields = ['id', 'created_at']
