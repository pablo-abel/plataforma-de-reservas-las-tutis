from django.urls import path
from . import views

urlpatterns = [
    path('available-slots/', views.available_slots, name='available-slots'),
    path('', views.create_appointment, name='create-appointment'),
    path('contact/', views.contact_view, name='contact'),
    path('admin/list/', views.list_appointments, name='list-appointments'),
    path('admin/create/', views.admin_create_appointment, name='admin-create-appointment'),
    path('admin/<int:pk>/', views.update_appointment, name='update-appointment'),
    path('admin/<int:pk>/delete/', views.delete_appointment, name='delete-appointment'),
]
