from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.authentication import BaseAuthentication


class SystemUserAuthentication(BaseAuthentication):
    """Authenticate every request as a system admin when AUTH_DISABLED is enabled."""

    def authenticate(self, request):
        if not getattr(settings, "AUTH_DISABLED", False):
            return None

        User = get_user_model()
        user, created = User.objects.get_or_create(
            username="system",
            defaults={
                "is_staff": True,
                "is_superuser": True,
                "role": "ADMIN",
                "is_active": True,
            },
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        else:
            updates = {}
            if not user.is_staff:
                updates["is_staff"] = True
            if not user.is_superuser:
                updates["is_superuser"] = True
            if getattr(user, "role", None) != "ADMIN":
                updates["role"] = "ADMIN"
            if updates:
                for key, value in updates.items():
                    setattr(user, key, value)
                user.save(update_fields=list(updates.keys()))

        return (user, None)
