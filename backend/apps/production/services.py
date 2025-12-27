from django.db import transaction
from django.utils import timezone

from apps.production.models import ContractSequence


def next_contract_no() -> str:
    year = timezone.localdate().year
    with transaction.atomic():
        seq, _ = ContractSequence.objects.select_for_update().get_or_create(
            year=year,
            defaults={"last_number": 0},
        )
        seq.last_number += 1
        seq.save(update_fields=["last_number"])
    return f"YG-{year}-{seq.last_number:06d}"
