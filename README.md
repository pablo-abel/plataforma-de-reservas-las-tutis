# Plataforma de Reservas - Las Tutis

Este proyecto es una plataforma web para la gestión de turnos de la peluquería canina Las Tutis. Cuenta con una arquitectura desacoplada (Frontend en una SPA y Backend en una API REST) y está completamente contenerizada con Docker.

Permite a los usuarios consultar horarios disponibles y reservar turnos en tiempo real bajo ciertas reglas de negocio (anticipación, límite de turnos por email y días no laborables), además de visualizar una galería de trabajos realizados y enviar consultas a través de un formulario de contacto. También incluye un panel de administración privado para gestionar los turnos y la galería.

## Stack Tecnológico

* **Backend:** Python 3.11, Django 5.2, Django REST Framework (DRF)
* **Base de Datos:** PostgreSQL 15
* **Frontend:** HTML5, CSS3, JavaScript (ES6+), SweetAlert2
* **Contenedores:** Docker y Docker Compose
* **CI/CD:** GitHub Actions (PostgreSQL service container)

## Características Principales

* **Arquitectura Desacoplada:** El frontend (/front) funciona como una aplicación estática independiente que se comunica con el backend (/backend) a través de peticiones HTTP. La configuración incluye un proxy en `vercel.json` para redirigir las solicitudes a la API y evitar problemas de CORS.
* **Validación de Imágenes:** Al subir imágenes para la galería, el backend no solo verifica la extensión, sino que realiza una validación del archivo binario usando la librería Pillow para asegurar que sea una imagen válida y no un archivo malicioso. Los archivos se renombran con nombres únicos (UUID) para evitar colisiones.
* **Reglas de Negocio:**
  * Bloques horarios de 60 minutos con un margen de 15 minutos entre turnos.
  * Límite máximo de 3 reservas diarias por correo electrónico.
  * Bloqueo de días no laborables configurados en la aplicación (por defecto Domingos y Lunes).
  * Margen mínimo de anticipación de 12 horas para solicitar turnos.

## Estructura del Proyecto

```text
├── .github/workflows/   # Workflow de GitHub Actions para tests
├── backend/             # Código del servidor (Django)
│   ├── appointments/    # Lógica de turnos y contacto
│   ├── gallery/         # Gestión de la galería de fotos
│   └── core/            # Configuración principal del proyecto
├── front/               # Frontend de la aplicación (HTML, CSS, JS)
│   └── vercel.json      # Configuración de proxy para Vercel
└── docker-compose.yml   # Configuración de Docker Compose (PostgreSQL y Web)
```

## Instalación y Ejecución con Docker

### Requisitos
* Docker y Docker Compose instalados.

### Pasos para iniciar localmente

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/pablo-abel/plataforma-de-reservas-las-tutis.git
   cd plataforma-de-reservas-las-tutis
   ```

2. Crear el archivo de variables de entorno:
   Crear un archivo `.env` en la carpeta `backend/` con el siguiente contenido base:
   ```env
   DJANGO_DEBUG=True
   DJANGO_SECRET_KEY=clave_desarrollo_123
   DB_HOST=db
   DB_PORT=5432
   POSTGRES_DB=lastutis
   POSTGRES_USER=lastutis
   POSTGRES_PASSWORD=lastutis
   NON_WORKING_WEEKDAYS=0,6
   OWNER_EMAIL=admin@lastutis.com
   ```

3. Iniciar contenedores:
   ```bash
   docker-compose up --build
   ```

4. URLs de acceso:
   * **Frontend:** Abrir `front/index.html` (o usar Live Server).
   * **API del Backend:** `http://localhost:8000/api/`
   * **Administración de Django:** `http://localhost:8000/admin/`

## Pruebas Unitarias y CI/CD

El proyecto incluye pruebas automatizadas para validar las reglas de negocio en la API (superposición de turnos, límites de spam por correo, anticipación y días no laborables).

Para correr los tests en el contenedor de Docker:
```bash
docker-compose exec web python core/manage.py test appointments gallery
```

El repositorio tiene configurado un pipeline de GitHub Actions (`.github/workflows/django.yml`) que levanta una base de datos PostgreSQL, aplica migraciones y corre los tests automáticamente ante cada push en las ramas principales.
