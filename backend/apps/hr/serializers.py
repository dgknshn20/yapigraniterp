from rest_framework import serializers

from apps.hr.models import Employee, Payroll


class EmployeeSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField(read_only=True)
    account_balance = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "created_at",
            "updated_at",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "phone",
            "tc_number",
            "base_salary",
            "iban",
            "hire_date",
            "remaining_leave_days",
            "assigned_assets",
            "account",
            "account_balance",
            "is_active",
        ]

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip()

    def get_account_balance(self, obj):
        if not obj.account:
            return "0.00"
        return str(obj.account.cached_balance)


class PayrollSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField(read_only=True)
    net_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Payroll
        fields = "__all__"

    def get_employee_name(self, obj):
        return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
