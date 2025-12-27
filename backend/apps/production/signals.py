from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from apps.production.models import Contract
from apps.inventory.models import StockReservation


@receiver(pre_save, sender=Contract)
def _track_contract_status(sender, instance, **kwargs):
    if not instance.pk:
        return
    prev_status = Contract.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
    instance._prev_status = prev_status


@receiver(post_save, sender=Contract)
def _handle_contract_status_change(sender, instance, **kwargs):
    prev_status = getattr(instance, "_prev_status", None)
    if not prev_status or prev_status == instance.status:
        return

    if instance.status == "IMZALANDI":
        reservations = StockReservation.objects.filter(contract=instance, status="SOFT_RESERVED")
        for res in reservations:
            res.status = "HARD_RESERVED"
            res.save(update_fields=["status"])
            if res.slab:
                slab = res.slab
                slab.status = "RESERVED"
                slab.reserved_for = instance
                slab.reserved_at = slab.reserved_at or timezone.now()
                slab.soft_reserved_for = None
                slab.soft_reserved_until = None
                slab.save(update_fields=[
                    "status",
                    "reserved_for",
                    "reserved_at",
                    "soft_reserved_for",
                    "soft_reserved_until",
                ])

    if instance.status == "CANCELLED":
        reservations = StockReservation.objects.filter(contract=instance).exclude(status="RELEASED")
        for res in reservations:
            res.status = "RELEASED"
            res.released_at = timezone.now()
            res.release_reason = "Sözleşme iptal edildi"
            res.save(update_fields=["status", "released_at", "release_reason"])
            if res.slab:
                slab = res.slab
                if slab.soft_reserved_for_id == instance.id:
                    slab.soft_reserved_for = None
                    slab.soft_reserved_until = None
                if slab.reserved_for_id == instance.id and slab.status == "RESERVED":
                    slab.status = "AVAILABLE"
                    slab.reserved_for = None
                    slab.reserved_at = None
                slab.save(update_fields=[
                    "soft_reserved_for",
                    "soft_reserved_until",
                    "status",
                    "reserved_for",
                    "reserved_at",
                ])
