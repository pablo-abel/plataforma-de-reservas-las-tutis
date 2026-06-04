import os
import uuid
from django.db import models
from django.core.exceptions import ValidationError
from PIL import Image

def validate_image_file(file):
    """
    Validador personalizado de seguridad para subida de archivos:
    1. Limita el tamaño del archivo a un máximo de 2MB.
    2. Realiza una verificación profunda abriendo el archivo con Pillow
       para comprobar que realmente sea una imagen binaria válida y no un script.
    """
    # 1. Validar el tamaño (máximo 2MB)
    max_size = 2 * 1024 * 1024  # 2MB en bytes
    if file.size > max_size:
        raise ValidationError("La imagen es demasiado pesada. El tamaño máximo permitido es 2MB.")

    # 2. Validar cabezal real de imagen usando Pillow
    try:
        # Volvemos a colocar el puntero del archivo al inicio (buena práctica en Django)
        file.seek(0)
        img = Image.open(file)
        img.verify()  # Verifica que el archivo sea una imagen real
        file.seek(0)  # Devolvemos el puntero al inicio
    except Exception:
        raise ValidationError("El archivo no es una imagen válida o está corrompido.")

def upload_to_unique_filename(instance, filename):
    """
    Generador de nombres únicos (UUID):
    Toma el archivo original (ej: caniche.jpg), extrae su extensión,
    genera un nombre aleatorio hexadecimal de 32 caracteres y lo guarda
    bajo la ruta 'gallery/'. Esto previene colisiones e inyecciones de caracteres.
    """
    ext = os.path.splitext(filename)[1].lower()
    # Permitir únicamente extensiones seguras y estándares
    if ext not in ['.jpg', '.jpeg', '.png', '.webp']:
        ext = '.jpg'  # Extensión segura por defecto si llega algo raro
    
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    return os.path.join('gallery', unique_filename)


class HaircutImage(models.Model):
    """
    Modelo de la Galería de Cortes de Pelo (Mini-Instagram canino):
    Guarda la referencia a la imagen física y datos descriptivos para SEO.
    """
    image = models.ImageField(
        upload_to=upload_to_unique_filename,
        validators=[validate_image_file],
        help_text="Suba imágenes en formato JPG, PNG o WEBP. Máximo 2MB."
    )
    alt_text = models.CharField(
        max_length=150,
        blank=True,
        help_text="Descripción del corte para SEO y accesibilidad (ej: Corte Caniche cachorro)."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']  # Mostrar siempre las más recientes primero

    def __str__(self):
        return f"Corte {self.id} - {self.alt_text or 'Sin descripción'}"
