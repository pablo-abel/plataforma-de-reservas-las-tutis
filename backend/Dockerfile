# 1. Imagen base oficial de Python liviana y optimizada para producción
FROM python:3.11-slim

# 2. Configurar variables de entorno para optimizar Python en Docker
# - PYTHONDONTWRITEBYTECODE: Evita que Python escriba archivos .pyc en disco
# - PYTHONUNBUFFERED: Asegura que los logs de salida se impriman en vivo en consola
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 3. Instalar dependencias del sistema requeridas para PostgreSQL y Pillow
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 4. Copiar e instalar dependencias de Python (Aprovecha el caché de capas de Docker)
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copiar el código fuente completo del backend
COPY . /app/
