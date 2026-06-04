"""
Configuración WSGI para el proyecto core.

Expone la variable WSGI callable como ``application``.

Para más información sobre este archivo, véase
https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

application = get_wsgi_application()
