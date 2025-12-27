from django.contrib import admin

from apps.hr.models import Employee, Payroll


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ("first_name", "last_name", "role", "phone", "is_active")
    list_filter = ("role", "is_active")
    search_fields = ("first_name", "last_name", "phone", "tc_number", "iban")


@admin.register(Payroll)
class PayrollAdmin(admin.ModelAdmin):
    list_display = ("employee", "year", "month", "base_salary", "deduction_amount", "is_paid", "paid_at")
    list_filter = ("year", "month", "is_paid")
    search_fields = ("employee__first_name", "employee__last_name")
