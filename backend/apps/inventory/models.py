from django.db import models
from apps.core.models import TimeStampedModel

class ProductDefinition(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name

class Slab(TimeStampedModel):
    STATUS_CHOICES = (
        ("AVAILABLE", "Stokta"),
        ("RESERVED", "Rezerve (Projeye Atandı)"),
        ("USED", "Kesildi/Kullanıldı"),
        ("SOLD", "Doğrudan Satıldı"),
        ("PART_STOCK", "Parça Stok"),
        ("SCRAP", "Çöp/Fire"),
    )

    FIRE_DISPOSITION_CHOICES = (
        ("UNKNOWN", "Belirtilmedi"),
        ("PART_STOCK", "Parça Stok"),
        ("SCRAP", "Çöp/Fire"),
    )

    product = models.ForeignKey("inventory.ProductDefinition", on_delete=models.PROTECT, related_name="slabs")
    barcode = models.CharField(max_length=50, unique=True, verbose_name="Plaka Barkodu/No")

    width = models.DecimalField(max_digits=10, decimal_places=2)
    length = models.DecimalField(max_digits=10, decimal_places=2)
    thickness = models.DecimalField(max_digits=5, decimal_places=2, verbose_name="Kalınlık (mm)")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="AVAILABLE")

    # Kesim sonrası kalan parçanın ne olacağı
    fire_disposition = models.CharField(
        max_length=20,
        choices=FIRE_DISPOSITION_CHOICES,
        default="UNKNOWN",
        blank=True,
    )

    reserved_for = models.ForeignKey("production.Contract", on_delete=models.SET_NULL, null=True, blank=True)
    reserved_at = models.DateTimeField(null=True, blank=True)
    soft_reserved_for = models.ForeignKey(
        "production.Contract",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="soft_reserved_slabs",
    )
    soft_reserved_until = models.DateTimeField(null=True, blank=True)
    warehouse_location = models.CharField(max_length=50, blank=True, help_text="Depo Raf/Bölüm Kodu")

    photo = models.ImageField(upload_to="slabs/", blank=True, null=True, verbose_name="Plaka Fotoğrafı")
    photo_url = models.URLField(blank=True, verbose_name="Plaka Fotoğraf URL")

    @property
    def area_m2(self):
        return (self.width * self.length) / 10000


class StockReservation(TimeStampedModel):
    STATUS_CHOICES = (
        ("SOFT_RESERVED", "Soft Reserved"),
        ("HARD_RESERVED", "Hard Reserved"),
        ("RELEASED", "Released"),
    )

    contract = models.ForeignKey("production.Contract", on_delete=models.CASCADE, related_name="stock_reservations")
    proposal_item = models.ForeignKey("crm.ProposalItem", on_delete=models.CASCADE, related_name="reservations")
    product = models.ForeignKey("inventory.ProductDefinition", on_delete=models.PROTECT)
    slab = models.ForeignKey("inventory.Slab", on_delete=models.SET_NULL, null=True, blank=True)

    area_m2 = models.DecimalField(max_digits=19, decimal_places=4, default=0)
    thickness_mm = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="SOFT_RESERVED")
    expires_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    release_reason = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        unique_together = ("contract", "proposal_item")
        ordering = ["-created_at", "-id"]
