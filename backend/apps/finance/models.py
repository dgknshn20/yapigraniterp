from decimal import Decimal
import calendar
from datetime import date

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.db.models import Sum
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from apps.core.models import TimeStampedModel, Notification

class Currency(models.TextChoices):
    TRY = "TRY", "Türk Lirası"
    USD = "USD", "Amerikan Doları"
    EUR = "EUR", "Euro"

class Account(TimeStampedModel):
    TYPE_CHOICES = (
        ("CASH", "Nakit Kasa"),
        ("BANK", "Banka Hesabı"),
        ("POS", "POS / Kredi Kartı"),
        ("EMPLOYEE", "Personel Cari"),
        ("PARTNER", "Ortak Cari (Şahsi)"),
    )

    name = models.CharField(max_length=100, verbose_name="Hesap Adı")
    account_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.TRY)
    initial_balance = models.DecimalField(max_digits=19, decimal_places=2, default=0, verbose_name="Açılış Bakiyesi")

    cached_balance = models.DecimalField(
        max_digits=19,
        decimal_places=2,
        default=0,
        editable=False,
        verbose_name="Cache Bakiye",
        help_text="Performans amaçlı tutulur. Gerçek bakiye transaction'lardan hesaplanmalıdır.",
    )

    class Meta:
        verbose_name = "Hesap/Kasa"
        verbose_name_plural = "Hesaplar & Kasalar"
        unique_together = ("name", "currency")

    def __str__(self):
        return f"{self.name} ({self.currency})"

class Transaction(TimeStampedModel):
    """
    Çift Taraflı Kayıt (Double-Entry) Mantığı:
    - Para Girişi: source_account=None, target_account=KASA/BANK
    - Para Çıkışı: source_account=KASA/BANK, target_account=None
    - Virman: source_account=KASA_TL, target_account=BANKA_TL
    """

    TRANSACTION_TYPES = (
        ("INCOME", "Tahsilat / Giriş"),
        ("EXPENSE", "Ödeme / Çıkış"),
        ("TRANSFER", "Virman / Transfer"),
    )

    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    date = models.DateField(default=timezone.now, verbose_name="İşlem Tarihi")
    amount = models.DecimalField(
        max_digits=19,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        verbose_name="Tutar",
    )
    description = models.CharField(max_length=255, verbose_name="Açıklama")

    source_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="outgoing_transactions",
        null=True,
        blank=True,
        verbose_name="Kaynak Hesap (Çıkan)",
    )
    target_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="incoming_transactions",
        null=True,
        blank=True,
        verbose_name="Hedef Hesap (Giren)",
    )

    related_customer = models.ForeignKey("crm.Customer", on_delete=models.SET_NULL, null=True, blank=True)
    related_contract = models.ForeignKey("production.Contract", on_delete=models.SET_NULL, null=True, blank=True)

    document = models.FileField(upload_to="finance/receipts/", blank=True, null=True, verbose_name="Dekont/Fiş")

    def clean(self):
        super().clean()

        if self.transaction_type == "TRANSFER":
            if not self.source_account or not self.target_account:
                raise ValidationError("Virman işlemlerinde hem kaynak hem hedef hesap seçilmelidir.")
            if self.source_account_id == self.target_account_id:
                raise ValidationError("Kaynak ve hedef hesap aynı olamaz.")
            if self.source_account.currency != self.target_account.currency:
                raise ValidationError(
                    "Farklı para birimleri arasında doğrudan virman yapılamaz. Kur işlemi girilmelidir."
                )

        if self.transaction_type == "INCOME":
            if self.source_account is not None:
                raise ValidationError("Tahsilat işlemlerinde kaynak hesap seçilmez (dış kaynak/müşteri).")
            if self.target_account is None:
                raise ValidationError("Tahsilat işlemlerinde hedef hesap seçilmelidir.")

        if self.transaction_type == "EXPENSE":
            if self.target_account is not None:
                raise ValidationError("Ödeme işlemlerinde hedef hesap seçilmez (dış hedef/tedarikçi).")
            if self.source_account is None:
                raise ValidationError("Ödeme işlemlerinde kaynak hesap seçilmelidir.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

class Cheque(TimeStampedModel):
    STATUS_CHOICES = (
        ("PORTFOLIO", "Portföyde (Bizde)"),
        ("ENDORSED", "Ciro Edildi (Tedarikçiye Verildi)"),
        ("BANK", "Bankada (Tahsilde)"),
        ("COLLECTED", "Tahsil Edildi"),
        ("BOUNCED", "Karşılıksız/Döndü"),
    )

    serial_number = models.CharField(max_length=50, unique=True, verbose_name="Çek Seri No")
    drawer = models.CharField(max_length=200, default="", verbose_name="Keşideci (Çek Sahibi)")
    amount = models.DecimalField(max_digits=19, decimal_places=2)
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.TRY)
    due_date = models.DateField(verbose_name="Vade Tarihi")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PORTFOLIO")

    current_location = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Örn: Kasada, Meka Granit'te",
    )

    received_from_customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.SET_NULL,
        null=True,
        related_name="given_cheques",
        verbose_name="Alınan Müşteri",
    )
    given_to_supplier = models.CharField(max_length=200, blank=True, default="", verbose_name="Verilen Tedarikçi/Kişi")

    photo_front = models.ImageField(upload_to="cheques/", blank=True, null=True)
    photo_back = models.ImageField(upload_to="cheques/", blank=True, null=True)

    @property
    def days_to_due(self):
        delta = self.due_date - timezone.now().date()
        return delta.days

    def save(self, *args, **kwargs):
        old_status = None
        creating = self.pk is None
        if not creating:
            old_status = Cheque.objects.filter(pk=self.pk).values_list("status", flat=True).first()

        super().save(*args, **kwargs)

        # Notification hooks (role-based)
        if creating:
            Notification.objects.create(
                recipient_role="FINANCE",
                title="Yeni çek eklendi",
                message=f"{self.serial_number} • {self.amount} {self.currency} • Vade: {self.due_date}",
                level="INFO",
                related_url="/finance",
            )
        elif old_status and old_status != self.status:
            Notification.objects.create(
                recipient_role="FINANCE",
                title="Çek durumu güncellendi",
                message=f"{self.serial_number} • {old_status} → {self.status}",
                level="INFO",
                related_url="/finance",
            )


class PaymentPlan(TimeStampedModel):
    METHOD_CHOICES = (
        ("CASH", "Peşin"),
        ("INSTALLMENT", "Vadeli/Taksit"),
        ("CHEQUE", "Çek"),
        ("MIXED", "Karma"),
    )

    contract = models.OneToOneField(
        "production.Contract",
        on_delete=models.CASCADE,
        related_name="payment_plan",
    )
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default="CASH")
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.TRY)
    total_amount = models.DecimalField(max_digits=19, decimal_places=2, default=0)
    installment_count = models.PositiveSmallIntegerField(default=4)
    first_due_date = models.DateField(default=timezone.localdate)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Ödeme Planı"
        verbose_name_plural = "Ödeme Planları"

    def __str__(self):
        return f"{self.contract_id} - {self.method} ({self.total_amount} {self.currency})"

    @staticmethod
    def add_months(d: date, months: int) -> date:
        month = d.month - 1 + months
        year = d.year + month // 12
        month = month % 12 + 1
        day = min(d.day, calendar.monthrange(year, month)[1])
        return date(year, month, day)

    def _default_installment_method(self):
        if self.method == "CHEQUE":
            return "CHEQUE"
        if self.method == "INSTALLMENT":
            return "TRANSFER"
        return "CASH"

    def build_installments(self, schedule=None):
        """Create/update installments idempotently.

        schedule: optional list of dicts with keys: installment_no, due_date, amount, method.
        """
        if schedule is None:
            if self.method == "CASH":
                due_date = self.first_due_date or timezone.localdate()
                schedule = [
                    {
                        "installment_no": 1,
                        "due_date": due_date,
                        "amount": Decimal(self.total_amount or 0).quantize(Decimal("0.01")),
                        "method": self._default_installment_method(),
                    }
                ]
            else:
                count = int(self.installment_count or 0)
                if count <= 0:
                    raise ValidationError("Taksit sayısı 1 veya daha büyük olmalıdır.")

                total = Decimal(self.total_amount or 0).quantize(Decimal("0.01"))
                base = (total / Decimal(count)).quantize(Decimal("0.01"))
                amounts = [base for _ in range(count)]
                diff = total - sum(amounts)
                amounts[-1] = (amounts[-1] + diff).quantize(Decimal("0.01"))
                schedule = []
                for i in range(count):
                    schedule.append(
                        {
                            "installment_no": i + 1,
                            "due_date": self.add_months(self.first_due_date, i),
                            "amount": amounts[i],
                            "method": self._default_installment_method(),
                        }
                    )

        existing = {inst.installment_no: inst for inst in self.installments.all()}
        used_numbers = set()

        for item in schedule:
            no = int(item["installment_no"])
            used_numbers.add(no)
            inst = existing.get(no)
            amount = Decimal(item.get("amount") or 0).quantize(Decimal("0.01"))
            method = (item.get("method") or self._default_installment_method()).upper()
            if inst:
                if inst.status == "PAID":
                    continue
                updates = {}
                for field, value in (
                    ("due_date", item.get("due_date")),
                    ("amount", amount),
                    ("method", method),
                ):
                    if value is not None and getattr(inst, field) != value:
                        updates[field] = value
                if updates:
                    for key, value in updates.items():
                        setattr(inst, key, value)
                    inst.save(update_fields=list(updates.keys()))
            else:
                PaymentInstallment.objects.create(
                    plan=self,
                    installment_no=no,
                    due_date=item.get("due_date"),
                    amount=amount,
                    currency=self.currency,
                    method=method,
                )

        # Cancel extra pending installments not in schedule
        for no, inst in existing.items():
            if no in used_numbers:
                continue
            if inst.status == "PENDING":
                inst.status = "CANCELLED"
                inst.save(update_fields=["status"])


class PaymentInstallment(TimeStampedModel):
    METHOD_CHOICES = (
        ("CASH", "Nakit"),
        ("TRANSFER", "Havale/EFT"),
        ("POS", "POS/Kart"),
        ("CHEQUE", "Çek"),
    )

    STATUS_CHOICES = (
        ("PENDING", "Bekleyen"),
        ("PAID", "Ödendi"),
        ("CANCELLED", "İptal"),
    )

    plan = models.ForeignKey(PaymentPlan, on_delete=models.CASCADE, related_name="installments")
    installment_no = models.PositiveSmallIntegerField()
    due_date = models.DateField()
    amount = models.DecimalField(max_digits=19, decimal_places=2)
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.TRY)
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default="CASH")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    paid_at = models.DateField(null=True, blank=True)
    paid_transaction = models.ForeignKey(
        "finance.Transaction",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="paid_installments",
    )

    class Meta:
        verbose_name = "Taksit"
        verbose_name_plural = "Taksitler"
        unique_together = ("plan", "installment_no")
        ordering = ["due_date", "installment_no"]

    def __str__(self):
        return f"{self.plan_id}#{self.installment_no} {self.amount} {self.currency} {self.status}"


class PaymentReminder(TimeStampedModel):
    STATUS_CHOICES = (
        ("PENDING", "Bekliyor"),
        ("SENT", "Gönderildi"),
        ("CANCELLED", "İptal"),
    )

    installment = models.ForeignKey("finance.PaymentInstallment", on_delete=models.CASCADE, related_name="reminders")
    run_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    message = models.CharField(max_length=255, blank=True, default="")
    recipient_role = models.CharField(max_length=20, blank=True, default="")

    class Meta:
        ordering = ["run_at", "id"]


class FixedExpense(TimeStampedModel):
    name = models.CharField(max_length=200, verbose_name="Gider Adı")
    amount = models.DecimalField(
        max_digits=19,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        verbose_name="Tutar",
    )
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.TRY)
    due_day = models.PositiveSmallIntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(31)],
        verbose_name="Ayın Kaçıncı Günü",
    )
    start_date = models.DateField(default=timezone.localdate, verbose_name="Başlangıç Tarihi")
    end_date = models.DateField(null=True, blank=True, verbose_name="Bitiş Tarihi")
    is_active = models.BooleanField(default=True, verbose_name="Aktif")
    notes = models.CharField(max_length=255, blank=True, default="", verbose_name="Not")

    class Meta:
        verbose_name = "Sabit Gider"
        verbose_name_plural = "Sabit Giderler"
        ordering = ["name", "due_day"]

    def __str__(self):
        return f"{self.name} ({self.amount} {self.currency})"


def _recalculate_account_balance(account_id):
    if not account_id:
        return
    account = Account.objects.filter(id=account_id).first()
    if not account:
        return
    incoming = Transaction.objects.filter(target_account_id=account_id).aggregate(s=Sum("amount"))["s"] or 0
    outgoing = Transaction.objects.filter(source_account_id=account_id).aggregate(s=Sum("amount"))["s"] or 0
    account.cached_balance = (account.initial_balance or 0) + incoming - outgoing
    account.save(update_fields=["cached_balance"])


@receiver(pre_save, sender=Transaction)
def _track_transaction_accounts(sender, instance, **kwargs):
    if not instance.pk:
        return
    prev = Transaction.objects.filter(pk=instance.pk).values(
        "source_account_id",
        "target_account_id",
    ).first()
    if not prev:
        return
    instance._prev_source_account_id = prev.get("source_account_id")
    instance._prev_target_account_id = prev.get("target_account_id")


@receiver(post_save, sender=Transaction)
def _update_account_balances_on_save(sender, instance, **kwargs):
    account_ids = {
        instance.source_account_id,
        instance.target_account_id,
        getattr(instance, "_prev_source_account_id", None),
        getattr(instance, "_prev_target_account_id", None),
    }
    for account_id in {aid for aid in account_ids if aid}:
        _recalculate_account_balance(account_id)


@receiver(post_delete, sender=Transaction)
def _update_account_balances_on_delete(sender, instance, **kwargs):
    account_ids = {instance.source_account_id, instance.target_account_id}
    for account_id in {aid for aid in account_ids if aid}:
        _recalculate_account_balance(account_id)
