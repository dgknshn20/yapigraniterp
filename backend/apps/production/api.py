from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from apps.production.models import Contract
from apps.production.serializers import (
    ContractSerializer,
)
from apps.core.permissions import RolePermission, is_admin


class ContractViewSet(viewsets.ModelViewSet):
    queryset = Contract.objects.select_related("proposal", "proposal__customer").all().order_by("-id")
    serializer_class = ContractSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN", "SALES", "FINANCE", "PRODUCTION"}
    write_roles = {"ADMIN", "SALES"}

    def get_queryset(self):
        qs = Contract.objects.select_related("proposal", "proposal__customer").all().order_by("-id")
        user = self.request.user
        if not is_admin(user) and getattr(user, "role", None) == "SALES":
            qs = qs.filter(proposal__customer__owner=user)
        return qs
