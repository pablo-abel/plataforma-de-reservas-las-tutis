from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth.models import User
from .serializers import LoginSerializer

@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    Endpoint de login para administradores.
    Devuelve token de autenticación y datos del usuario.
    """
    serializer = LoginSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.validated_data['user']
        token, created = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'is_staff': user.is_staff,
            }
        })
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([AllowAny])
def logout_view(request):
    """
    Endpoint de logout.
    Elimina el token del usuario.
    """
    # Obtiene y elimina el token de autenticación para cerrar la sesión
    try:
        # El token se envía en el header Authorization
        auth_header = request.META.get('HTTP_AUTHORIZATION')
        if auth_header and auth_header.startswith('Token '):
            token_key = auth_header.split(' ')[1]
            token = Token.objects.get(key=token_key)
            token.delete()
        return Response({'message': 'Logout exitoso'})
    except Token.DoesNotExist:
        return Response({'message': 'Token inválido'}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
def me_view(request):
    """
    Devuelve información del usuario autenticado.
    """
    if not request.user.is_authenticated:
        return Response({'error': 'No autenticado'}, status=status.HTTP_401_UNAUTHORIZED)
    
    return Response({
        'user': {
            'id': request.user.id,
            'username': request.user.username,
            'email': request.user.email,
            'is_staff': request.user.is_staff,
        }
    })
