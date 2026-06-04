import io
import os
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from .models import HaircutImage

class GalleryAPITests(APITestCase):
    """
    Batería de pruebas automatizadas para la API de galería de fotos.
    Valida carga pública, subida segura con validadores de Pillow,
    restricciones de seguridad admin, y remoción física de archivos.
    """

    def setUp(self):
        # Crear usuario administrador para probar endpoints protegidos
        self.admin_user = User.objects.create_superuser(
            username="admin_test",
            email="admin@test.com",
            password="securepassword123"
        )
        
        # Crear un usuario estándar (no administrador)
        self.standard_user = User.objects.create_user(
            username="regular_test",
            email="regular@test.com",
            password="securepassword123"
        )

        # Generar una imagen GIF válida en memoria para pruebas de Pillow
        img_buffer = io.BytesIO()
        image = Image.new("RGBA", size=(100, 100), color=(7, 107, 79))
        image.save(img_buffer, "png")
        img_buffer.seek(0)
        
        self.mock_image = SimpleUploadedFile(
            name="test_caniche.png",
            content=img_buffer.read(),
            content_type="image/png"
        )

    def test_list_images_anonymous(self):
        """Verifica que cualquier visitante anónimo pueda listar las fotos de la galería."""
        # Creamos un registro previo en base de datos
        HaircutImage.objects.create(
            image=self.mock_image,
            alt_text="Corte pomerania de muestra"
        )

        res = self.client.get("/api/gallery/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["alt_text"], "Corte pomerania de muestra")

    def test_upload_image_as_admin_success(self):
        """Verifica que el administrador pueda subir fotos y que el nombre sea UUID aleatorio."""
        self.client.force_authenticate(user=self.admin_user)
        
        payload = {
            "image": self.mock_image,
            "alt_text": "Corte Caniche Admin"
        }
        res = self.client.post("/api/gallery/upload/", payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(HaircutImage.objects.count(), 1)
        
        # Verificar que el nombre físico del archivo se haya convertido a UUID
        saved_img = HaircutImage.objects.first()
        filename = os.path.basename(saved_img.image.name)
        # La extensión debe ser png y el nombre sin extensión debe ser un UUID hexadecimal válido (32 caracteres)
        name_part, ext = os.path.splitext(filename)
        self.assertEqual(ext, ".png")
        self.assertEqual(len(name_part), 32)  # UUID hex length

    def test_upload_image_as_anonymous_denied(self):
        """Rechaza la subida de imágenes de usuarios anónimos o no logueados."""
        payload = {
            "image": self.mock_image,
            "alt_text": "Corte intruso"
        }
        res = self.client.post("/api/gallery/upload/", payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(HaircutImage.objects.count(), 0)

    def test_upload_image_as_regular_user_denied(self):
        """Rechaza la subida de imágenes de usuarios logueados que no sean administradores."""
        self.client.force_authenticate(user=self.standard_user)
        
        payload = {
            "image": self.mock_image,
            "alt_text": "Corte intruso logueado"
        }
        res = self.client.post("/api/gallery/upload/", payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(HaircutImage.objects.count(), 0)

    def test_delete_image_as_admin_success(self):
        """Verifica que el admin pueda borrar registros y que se limpie físicamente el disco."""
        self.client.force_authenticate(user=self.admin_user)

        # Crear y guardar una imagen en base de datos
        image_instance = HaircutImage.objects.create(
            image=self.mock_image,
            alt_text="Corte a eliminar"
        )
        file_path = image_instance.image.path
        
        # Simular que el archivo existe en disco para el test de borrado
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(b"mock_image_data")

        self.assertTrue(os.path.exists(file_path))

        # Petición DELETE
        res = self.client.delete(f"/api/gallery/{image_instance.id}/delete/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(HaircutImage.objects.count(), 0)
        
        # ¡Verificación definitiva! El archivo debe haber desaparecido del disco rígido
        self.assertFalse(os.path.exists(file_path))

    def test_delete_image_as_anonymous_denied(self):
        """Rechaza el borrado de fotos si el visitante no está autenticado."""
        image_instance = HaircutImage.objects.create(
            image=self.mock_image,
            alt_text="Corte intocable"
        )
        
        res = self.client.delete(f"/api/gallery/{image_instance.id}/delete/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(HaircutImage.objects.count(), 1)
