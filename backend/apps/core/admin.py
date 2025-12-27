from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Notification, Task, SystemEvent

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Ek Bilgiler', {'fields': ('role', 'phone')}),
    )
    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'phone', 'is_staff')
    list_filter = BaseUserAdmin.list_filter + ('role',)


admin.site.register(Notification)
admin.site.register(Task)
admin.site.register(SystemEvent)
