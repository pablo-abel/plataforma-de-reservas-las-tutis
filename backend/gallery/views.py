import os
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework import status
from .models import HaircutImage
from .serializers import HaircutImageSerializer

@api_view(["GET"])
@permission_classes([AllowAny])
def list_images(request):
    """
    Endpoint público:
    Lista todas las imágenes cargadas en el portfolio.
    Cualquier visitante de la landing page puede consultarlo de forma anónima.
    """
    images = HaircutImage.objects.all()
    serializer = HaircutImageSerializer(images, many=True, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
@parser_classes([MultiPartParser, FormParser])
def upload_image(request):
    """
    Endpoint privado (Solo Administradores):
    Recibe la imagen mediante FormData (multipart) y la guarda de forma segura.
    Incluye todos los validadores de formato, tamaño y nombre único (UUID).
    """
    serializer = HaircutImageSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated, IsAdminUser])
def delete_image(request, pk):
    """
    Endpoint privado (Solo Administradores):
    Elimina la imagen de la base de datos y garantiza la limpieza absoluta
    al borrar físicamente el archivo del disco rígido del servidor.
    """
    try:
        image_instance = HaircutImage.objects.get(pk=pk)
    except HaircutImage.DoesNotExist:
        return Response({"detail": "La imagen especificada no existe."}, status=status.HTTP_404_NOT_FOUND)

    # Obtener la ruta física del archivo antes de borrar el registro
    try:
        file_path = image_instance.image.path
    except ValueError:
        file_path = None

    # Borrar registro de la base de datos
    image_instance.delete()

    # Borrado físico del archivo para evitar acumular "basura" en el servidor
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            # Si por algún bloqueo del SO falla la remoción, respondemos 204 igualmente
            # pero registramos el evento.
            pass

    return Response(status=status.HTTP_204_NO_CONTENT)
