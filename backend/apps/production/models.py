from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class Contract(TimeStampedModel):
    STATUS_CHOICES = (
        ("IMZA_BEKLIYOR", "İmza Bekliyor"),
        ("IMZALANDI", "İmzalandı"),
        ("ACTIVE", "Aktif"),
        ("COMPLETED", "Tamamlandı"),
        ("CANCELLED", "İptal"),
    )

    proposal = models.OneToOneField("crm.Proposal", on_delete=models.PROTECT, related_name="contract")
    contract_no = models.CharField(max_length=20, unique=True, blank=True, null=True, verbose_name="Sözleşme No")
    project_name = models.CharField(max_length=200, blank=True)
    job_address = models.TextField(blank=True, default="", verbose_name="İş/Adres")
    start_date = models.DateField(default=timezone.localdate)
    deadline_date = models.DateField(null=True, blank=True, verbose_name="Teslim Tarihi")
    special_terms = models.TextField(blank=True, verbose_name="Özel Şartlar")
    contract_file = models.FileField(
        upload_to="contracts/",
        blank=True,
        null=True,
        verbose_name="İmzalı Sözleşme PDF",
    )
    items_snapshot = models.JSONField(default=list, blank=True, verbose_name="Sözleşme Kalemleri (Snapshot)")

    customer_name = models.CharField(max_length=200, blank=True, default="")
    customer_address = models.TextField(blank=True, default="")
    customer_phone = models.CharField(max_length=30, blank=True, default="")
    customer_email = models.EmailField(blank=True, default="")
    customer_tax_number = models.CharField(max_length=50, blank=True, default="")
    customer_tax_office = models.CharField(max_length=100, blank=True, default="")

    subtotal_amount = models.DecimalField(max_digits=19, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=19, decimal_places=2, default=Decimal("0.00"))
    discount_amount = models.DecimalField(max_digits=19, decimal_places=2, default=Decimal("0.00"))
    total_amount = models.DecimalField(max_digits=19, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=3, default="TRY")
    include_tax = models.BooleanField(default=False)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("20.00"))
    valid_until = models.DateField(null=True, blank=True, verbose_name="Teklif Geçerlilik Tarihi")
    notes = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="IMZA_BEKLIYOR")
    is_active = models.BooleanField(default=True)

    @property
    def is_overdue(self):
        return bool(self.deadline_date and self.deadline_date < timezone.localdate())

    @property
    def source_offer_id(self):
        return self.proposal_id


class WorkOrder(TimeStampedModel):
    STAGE_CHOICES = (
        ("PLANLANACAK", "Planlanacak"),
        ("PENDING", "Bekliyor"),
        ("CUTTING", "Kesim"),
        ("POLISHING", "Cila/Yüzey İşlem"),
        ("READY", "Sevkiyata Hazır"),
        ("ASSEMBLY", "Montaj (Saha)"),
        ("COMPLETED", "Tamamlandı"),
    )

    KIND_CHOICES = (
        ("MEASUREMENT", "Saha Ölçü"),
        ("PRODUCTION", "Üretim"),
        ("DELIVERY", "Montaj/Teslim"),
        ("GENERAL", "Genel"),
    )

    title = models.CharField(max_length=200, help_text="Mutfak Tezgahı Kesimi vb.")
    stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default="PLANLANACAK")
    description = models.TextField()
    priority = models.IntegerField(default=1, verbose_name="Öncelik (1-5)")
    assigned_team = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        limit_choices_to={"role": "PRODUCTION"},
    )
    contract = models.ForeignKey("production.Contract", on_delete=models.CASCADE, related_name="work_orders")
    slab = models.ForeignKey(
        "inventory.Slab",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_orders",
        help_text="Hangi plaka kesilecek?",
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default="GENERAL")
    target_date = models.DateField(null=True, blank=True)


class Measurement(TimeStampedModel):
    data = models.JSONField(default=dict, verbose_name="Ölçü Detayları (JSON)")
    site_photo = models.ImageField(upload_to="measurements/", verbose_name="Saha Fotoğrafı")
    sketch_image = models.ImageField(
        upload_to="sketches/",
        blank=True,
        null=True,
        verbose_name="El Çizimi/Kroki",
    )
    notes = models.TextField(blank=True)
    taken_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    work_order = models.ForeignKey(
        "production.WorkOrder",
        on_delete=models.CASCADE,
        related_name="measurements",
        null=True,
        blank=True,
    )
    contract = models.ForeignKey(
        "production.Contract",
        on_delete=models.CASCADE,
        related_name="measurements",
        null=True,
        blank=True,
    )
    final_dimensions = models.JSONField(default=dict, blank=True, verbose_name="Net Ölçüler (JSON)")
    site_photos = models.JSONField(default=list, blank=True, verbose_name="Saha Fotoğrafları (Liste)")


class ProductionLog(TimeStampedModel):
    previous_stage = models.CharField(max_length=20)
    new_stage = models.CharField(max_length=20)
    timestamp = models.DateTimeField(default=timezone.now)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    work_order = models.ForeignKey("production.WorkOrder", on_delete=models.CASCADE, related_name="logs")
    note = models.TextField(blank=True, default="")


class ContractSequence(TimeStampedModel):
    year = models.PositiveSmallIntegerField(unique=True)
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Sözleşme Seri"
        verbose_name_plural = "Sözleşme Serileri"
