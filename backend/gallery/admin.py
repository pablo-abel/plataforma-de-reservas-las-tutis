from django.contrib import admin
from .models import HaircutImage

@admin.register(HaircutImage)
class HaircutImageAdmin(admin.ModelAdmin):
    list_display = ('id', 'alt_text', 'created_at', 'image')
    search_fields = ('alt_text',)
    list_filter = ('created_at',)

