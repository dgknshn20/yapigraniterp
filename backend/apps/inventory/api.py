from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.inventory.models import ProductDefinition, Slab
from apps.inventory.serializers import ProductDefinitionSerializer, SlabSerializer
from apps.core.permissions import RolePermission


class ProductDefinitionViewSet(viewsets.ModelViewSet):
    queryset = ProductDefinition.objects.all().order_by("name")
    serializer_class = ProductDefinitionSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN", "SALES", "PRODUCTION"}
    write_roles = {"ADMIN"}


class SlabViewSet(viewsets.ModelViewSet):
    queryset = Slab.objects.select_related("product", "reserved_for").all().order_by("-id")
    serializer_class = SlabSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN", "SALES", "PRODUCTION"}
    write_roles = {"ADMIN", "PRODUCTION"}

    def perform_update(self, serializer):
        instance = serializer.instance
        updated = serializer.save()

        # reserved_at otomatik
        if instance.status != updated.status:
            if updated.status == "RESERVED" and not updated.reserved_at:
                updated.reserved_at = timezone.now()
                updated.save(update_fields=["reserved_at"])
            if updated.status == "AVAILABLE" and updated.reserved_at:
                updated.reserved_at = None
                updated.reserved_for = None
                updated.save(update_fields=["reserved_at", "reserved_for"])
