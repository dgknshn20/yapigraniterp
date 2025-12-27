from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel


class Employee(TimeStampedModel):
    ROLES = (
        ("WORKER", "Usta / Üretim Personeli"),
        ("SALES", "Satış Temsilcisi"),
        ("OFFICE", "Ofis / Yönetim"),
        ("DRIVER", "Şoför / Lojistik"),
    )

    first_name = models.CharField(max_length=100, verbose_name="Ad")
    last_name = models.CharField(max_length=100, verbose_name="Soyad")
    role = models.CharField(max_length=20, choices=ROLES, default="WORKER")
    phone = models.CharField(max_length=20, blank=True)
    tc_number = models.CharField(max_length=11, blank=True, verbose_name="TC Kimlik No")

    base_salary = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
        verbose_name="Net Maaş",
    )
    iban = models.CharField(max_length=34, blank=True, verbose_name="IBAN")

    hire_date = models.DateField(null=True, blank=True, verbose_name="İşe Giriş Tarihi")
    remaining_leave_days = models.IntegerField(default=0, verbose_name="Kalan İzin Günü")
    assigned_assets = models.JSONField(default=list, blank=True, verbose_name="Zimmetlenen Eşyalar")

    account = models.OneToOneField(
        "finance.Account",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee_profile",
        help_text="Personel cari hesabı ile otomatik bağlantı",
    )

    is_active = models.BooleanField(default=True, verbose_name="Aktif Personel")

    class Meta:
        verbose_name = "Personel"
        verbose_name_plural = "Personeller"
        ordering = ["first_name", "last_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.get_role_display()})"


class Payroll(TimeStampedModel):
    MONTHS = (
        (1, "Ocak"),
        (2, "Şubat"),
        (3, "Mart"),
        (4, "Nisan"),
        (5, "Mayıs"),
        (6, "Haziran"),
        (7, "Temmuz"),
        (8, "Ağustos"),
        (9, "Eylül"),
        (10, "Ekim"),
        (11, "Kasım"),
        (12, "Aralık"),
    )

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="payrolls")
    year = models.IntegerField(default=2025)
    month = models.IntegerField(choices=MONTHS)

    base_salary = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
        verbose_name="Hakedilen Maaş",
    )

    overtime_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
        verbose_name="Mesai Saati",
    )

    overtime_hourly_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
        verbose_name="Saat Ücreti (Mesai)",
    )
    overtime_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
        verbose_name="Mesai Tutarı",
    )
    bonus_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
        verbose_name="Prim/Bonus",
    )
    deduction_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
        verbose_name="Kesinti/Avans",
    )

    note = models.TextField(blank=True, verbose_name="Açıklama")
    is_paid = models.BooleanField(default=False, verbose_name="Ödendi mi?")
    paid_at = models.DateField(null=True, blank=True)

    class Meta:
        unique_together = ("employee", "year", "month")
        ordering = ["-year", "-month"]
        verbose_name = "Bordro"
        verbose_name_plural = "Bordrolar"

    @property
    def net_total(self):
        return (self.base_salary + self.overtime_amount + self.bonus_amount) - self.deduction_amount

    def save(self, *args, **kwargs):
        hours = Decimal(self.overtime_hours or 0)
        rate = Decimal(self.overtime_hourly_rate or 0)
        self.overtime_amount = (hours * rate).quantize(Decimal("0.01"))
        return super().save(*args, **kwargs)
