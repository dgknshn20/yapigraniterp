from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.inventory.models import StockReservation
from apps.crm.models import OfferAuditLog


class Command(BaseCommand):
    help = "Süresi dolan soft rezervasyonları serbest bırakır."

    def handle(self, *args, **kwargs):
        now = timezone.now()
        expired = StockReservation.objects.filter(status="SOFT_RESERVED", expires_at__lt=now)
        count = expired.count()

        for res in expired:
            res.status = "RELEASED"
            res.released_at = now
            res.release_reason = "Süre doldu"
            res.save(update_fields=["status", "released_at", "release_reason"])

            if res.slab and res.slab.soft_reserved_for_id == res.contract_id:
                slab = res.slab
                slab.soft_reserved_for = None
                slab.soft_reserved_until = None
                slab.save(update_fields=["soft_reserved_for", "soft_reserved_until"])

            proposal = getattr(res.contract, "proposal", None)
            if proposal:
                OfferAuditLog.objects.get_or_create(
                    proposal=proposal,
                    action=f"RESERVATION_RELEASED_{res.id}",
                    defaults={
                        "message": "Soft rezervasyon süresi doldu ve serbest bırakıldı.",
                        "metadata": {"reservation_id": res.id},
                    },
                )

        self.stdout.write(self.style.SUCCESS(f"{count} rezervasyon serbest bırakıldı."))
