"""
Configuración de URL para el proyecto core.

La lista `urlpatterns` dirige las URLs a las vistas. Para obtener más información, véase:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Ejemplos:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('appointments.auth_urls')),
    path('api/appointments/', include('appointments.urls')),
    path('api/gallery/', include('gallery.urls')),
    # Sirve archivos media de forma directa en desarrollo y producción
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]
