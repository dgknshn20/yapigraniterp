from django.contrib import admin
from .models import ProductDefinition, Slab, StockReservation

admin.site.register(ProductDefinition)
admin.site.register(Slab)
admin.site.register(StockReservation)
