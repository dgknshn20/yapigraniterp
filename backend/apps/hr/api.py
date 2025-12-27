from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.hr.models import Employee, Payroll
from apps.hr.serializers import EmployeeSerializer, PayrollSerializer
from apps.core.permissions import RolePermission


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all().order_by("first_name")
    serializer_class = EmployeeSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN"}
    write_roles = {"ADMIN"}


class PayrollViewSet(viewsets.ModelViewSet):
    queryset = Payroll.objects.select_related("employee").all().order_by("-year", "-month")
    serializer_class = PayrollSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN"}
    write_roles = {"ADMIN"}
