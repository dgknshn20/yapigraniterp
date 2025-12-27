from django.db import models
from apps.core.models import TimeStampedModel
from apps.finance.models import Currency

from decimal import Decimal
import uuid

class Customer(TimeStampedModel):
    TYPE_CHOICES = (
        ("COMPANY", "Kurumsal Firma"),
        ("INDIVIDUAL", "Bireysel Şahıs"),
    )
    STATUS_CHOICES = (
        ("LEAD", "Potansiyel / Ön Kayıt"),
        ("NEGOTIATION", "Görüşülüyor"),
        ("ACTIVE", "Aktif / Çalışılıyor"),
        ("PAYMENT_DUE", "Ödeme Bekleniyor"),
        ("PASSIVE", "Pasif"),
        ("BLACKLIST", "İptal / Kara Liste"),
    )
    SEGMENT_CHOICES = (
        ("STANDARD", "Standart"),
        ("VIP", "VIP"),
        ("RISKY", "Riskli"),
    )

    customer_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="INDIVIDUAL")
    name = models.CharField(max_length=200, verbose_name="Müşteri/Firma Adı")
    tax_number = models.CharField(max_length=50, blank=True, verbose_name="TC / Vergi No")
    tax_office = models.CharField(max_length=100, blank=True, verbose_name="Vergi Dairesi")

    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    location_url = models.URLField(blank=True, verbose_name="Google Maps Konumu")

    risk_limit = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name="Risk Limiti")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="LEAD", verbose_name="Durum")
    segment = models.CharField(max_length=20, choices=SEGMENT_CHOICES, default="STANDARD", verbose_name="Segment")
    internal_notes = models.TextField(blank=True, default="", verbose_name="Şirket İçi Notlar")
    owner = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_customers",
        verbose_name="Müşteri Sorumlusu",
    )

    def __str__(self):
        return self.name


class Appointment(TimeStampedModel):
    date = models.DateField(verbose_name="Randevu Tarihi")
    title = models.CharField(max_length=200, blank=True, default="", verbose_name="Başlık")
    notes = models.TextField(blank=True, verbose_name="Not")
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="appointments",
    )
    source_type = models.CharField(max_length=50, blank=True, default="")
    source_id = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-date", "-id"]


class Proposal(TimeStampedModel):
    STATUS_CHOICES = (
        ("DRAFT", "Taslak"),
        ("SENT", "Müşteriye Gönderildi"),
        ("APPROVED", "Onaylandı (Sözleşme Bekliyor)"),
        ("REJECTED", "Reddedildi"),
        ("CONVERTED", "Sözleşmeye Dönüştü"),
    )

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="proposals")
    proposal_number = models.CharField(max_length=50, unique=True, editable=False)
    valid_until = models.DateField(null=True, blank=True, verbose_name="Geçerlilik Tarihi")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="DRAFT")
    currency = models.CharField(
        max_length=3,
        default=Currency.TRY,
        choices=[("TRY", "TL"), ("USD", "USD"), ("EUR", "EUR")],
    )

    total_amount = models.DecimalField(max_digits=19, decimal_places=2, default=0)
    notes = models.TextField(blank=True)

    include_tax = models.BooleanField(default=False, verbose_name="KDV Dahil")
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("20.00"),
        verbose_name="KDV Oranı (%)",
    )

    def save(self, *args, **kwargs):
        if not self.proposal_number:
            self.proposal_number = f"PR-{str(uuid.uuid4())[:8].upper()}"
        super().save(*args, **kwargs)

    @property
    def subtotal_amount(self):
        rate = (Decimal(self.tax_rate or 0) / Decimal("100"))
        total = Decimal(self.total_amount or 0)
        if self.include_tax and rate > 0:
            return (total / (Decimal("1") + rate)).quantize(Decimal("0.01"))
        return total.quantize(Decimal("0.01"))

    @property
    def tax_amount(self):
        rate = (Decimal(self.tax_rate or 0) / Decimal("100"))
        total = Decimal(self.total_amount or 0)
        if rate <= 0:
            return Decimal("0.00")
        if self.include_tax:
            return (total - self.subtotal_amount).quantize(Decimal("0.01"))
        return (self.subtotal_amount * rate).quantize(Decimal("0.01"))

    @property
    def grand_total(self):
        if self.include_tax:
            return Decimal(self.total_amount or 0).quantize(Decimal("0.01"))
        return (self.subtotal_amount + self.tax_amount).quantize(Decimal("0.01"))


class ProposalItem(models.Model):
    proposal = models.ForeignKey(Proposal, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("inventory.ProductDefinition", on_delete=models.PROTECT, null=True, blank=True)
    slab = models.ForeignKey("inventory.Slab", on_delete=models.SET_NULL, null=True, blank=True)

    description = models.CharField(max_length=200, blank=True, help_text="Örn: Mutfak Tezgahı")

    width = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    length = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    quantity = models.IntegerField(default=1)

    unit_price = models.DecimalField(max_digits=15, decimal_places=2)
    fire_rate = models.DecimalField(max_digits=5, decimal_places=2, default=10, verbose_name="Fire Oranı %")
    labor_cost = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name="İşçilik Tutarı")

    total_price = models.DecimalField(max_digits=19, decimal_places=2, editable=False, default=0)

    def save(self, *args, **kwargs):
        area_m2 = (self.width * self.length * Decimal(self.quantity)) / Decimal("10000")
        waste_multiplier = Decimal("1") + (self.fire_rate / Decimal("100"))
        material_cost = (area_m2 * self.unit_price * waste_multiplier)
        self.total_price = (material_cost + self.labor_cost).quantize(Decimal("0.01"))
        super().save(*args, **kwargs)


class OfferApprovalFlow(TimeStampedModel):
    proposal = models.OneToOneField("crm.Proposal", on_delete=models.CASCADE, related_name="approval_flow")
    approved_by = models.ForeignKey("core.User", on_delete=models.SET_NULL, null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    contract_id = models.PositiveIntegerField(null=True, blank=True)
    payment_plan_id = models.PositiveIntegerField(null=True, blank=True)
    reservation_ids = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = "Teklif Onay Akışı"
        verbose_name_plural = "Teklif Onay Akışları"


class OfferAuditLog(TimeStampedModel):
    proposal = models.ForeignKey("crm.Proposal", on_delete=models.CASCADE, related_name="audit_logs")
    actor = models.ForeignKey("core.User", on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=100)
    message = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Teklif Onay Logu"
        verbose_name_plural = "Teklif Onay Logları"
        unique_together = ("proposal", "action")
    
