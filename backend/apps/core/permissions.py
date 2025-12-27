from rest_framework.permissions import BasePermission, SAFE_METHODS


def is_admin(user) -> bool:
    return bool(user and user.is_authenticated and (user.is_superuser or getattr(user, "role", None) == "ADMIN"))


class RolePermission(BasePermission):
    """Role-based access control with separate read/write role lists on the view."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if is_admin(user):
            return True

        if request.method in SAFE_METHODS:
            allowed = getattr(view, "read_roles", None)
        else:
            allowed = getattr(view, "write_roles", None)

        if not allowed:
            return False
        return getattr(user, "role", None) in allowed
