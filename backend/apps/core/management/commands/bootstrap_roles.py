import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils.crypto import get_random_string


ROLE_USERS = [
    {"username": "admin", "role": "ADMIN", "is_superuser": True},
    {"username": "sales", "role": "SALES", "is_superuser": False},
    {"username": "finance", "role": "FINANCE", "is_superuser": False},
    {"username": "production", "role": "PRODUCTION", "is_superuser": False},
]

ROLE_ENV_PASSWORDS = {
    "ADMIN": "ADMIN_PASSWORD",
    "SALES": "SALES_PASSWORD",
    "FINANCE": "FINANCE_PASSWORD",
    "PRODUCTION": "PRODUCTION_PASSWORD",
}


class Command(BaseCommand):
    help = "Create or update default role users (admin/sales/finance/production)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset-passwords",
            action="store_true",
            help="Reset passwords even if users already exist.",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        reset = options.get("reset_passwords", False)

        for entry in ROLE_USERS:
            username = entry["username"]
            role = entry["role"]
            is_superuser = entry["is_superuser"]

            env_key = ROLE_ENV_PASSWORDS.get(role)
            env_password = os.getenv(env_key) if env_key else None
            generated_password = None

            if not env_password:
                generated_password = get_random_string(12)

            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "role": role,
                    "is_staff": is_superuser,
                    "is_superuser": is_superuser,
                },
            )

            updates = {}
            if user.role != role:
                updates["role"] = role
            if is_superuser and not user.is_staff:
                updates["is_staff"] = True
            if is_superuser and not user.is_superuser:
                updates["is_superuser"] = True

            if updates:
                for key, value in updates.items():
                    setattr(user, key, value)

            should_set_password = created or reset or not user.has_usable_password()
            if should_set_password:
                password = env_password or generated_password
                user.set_password(password)

            if updates or should_set_password:
                user.save()

            if created:
                self.stdout.write(self.style.SUCCESS(f"Created user: {username} ({role})"))
            else:
                self.stdout.write(self.style.WARNING(f"Updated user: {username} ({role})"))

            if should_set_password and generated_password:
                self.stdout.write(
                    self.style.SUCCESS(f"  Password for {username}: {generated_password}")
                )
            elif should_set_password and env_password:
                self.stdout.write(
                    self.style.SUCCESS(f"  Password for {username}: (from {env_key})")
                )
