from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone

class User(AbstractUser):
    ROLE_CHOICES = (
        ("ADMIN", "Yönetici"),
        ("SALES", "Satış Temsilcisi"),
        ("FINANCE", "Finans/Muhasebe"),
        ("PRODUCTION", "Üretim/Saha"),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="SALES")
    phone = models.CharField(max_length=15, blank=True, null=True)

class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Oluşturulma Tarihi")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Güncelleme Tarihi")

    class Meta:
        abstract = True


class Notification(TimeStampedModel):
    LEVEL_CHOICES = (
        ("INFO", "Bilgi"),
        ("SUCCESS", "Başarılı"),
        ("WARNING", "Uyarı"),
        ("ERROR", "Hata"),
    )

    recipient = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notifications",
    )
    recipient_role = models.CharField(
        max_length=20,
        choices=User.ROLE_CHOICES,
        blank=True,
        default="",
        help_text="Kullanıcı yerine role bazlı bildirim gönderimi için",
    )

    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    level = models.CharField(max_length=20, choices=LEVEL_CHOICES, default="INFO")

    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    related_url = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        ordering = ["-created_at", "-id"]

    def mark_read(self):
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=["is_read", "read_at"])


class Task(TimeStampedModel):
    PRIORITY_CHOICES = (
        (1, "Düşük"),
        (2, "Normal"),
        (3, "Yüksek"),
    )

    STATUS_CHOICES = (
        ("OPEN", "Açık"),
        ("DONE", "Tamamlandı"),
        ("CANCELLED", "İptal"),
    )

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    due_date = models.DateField(null=True, blank=True)
    priority = models.PositiveSmallIntegerField(choices=PRIORITY_CHOICES, default=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="OPEN")

    assigned_to = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    assigned_role = models.CharField(
        max_length=20,
        choices=User.ROLE_CHOICES,
        blank=True,
        default="",
    )

    related_url = models.CharField(max_length=300, blank=True, default="")
    source_type = models.CharField(max_length=50, blank=True, default="")
    source_id = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.title


class SystemEvent(TimeStampedModel):
    event_type = models.CharField(max_length=100)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.event_type
