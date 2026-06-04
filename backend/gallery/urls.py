from django.urls import path
from . import views

urlpatterns = [
    path('', views.list_images, name='list-images'),
    path('upload/', views.upload_image, name='upload-image'),
    path('<int:pk>/delete/', views.delete_image, name='delete-image'),
]
