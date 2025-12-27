from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.finance.models import PaymentPlan
from apps.inventory.models import StockReservation
from apps.production.models import Contract


pytestmark = pytest.mark.django_db
def test_finalize_creates_contract_plan_and_reservations(
    users,
    make_proposal,
    make_proposal_item,
    settings,
    tmp_path,
):
    settings.MEDIA_ROOT = tmp_path

    sales = users["SALES"]
    proposal = make_proposal(owner=sales, total_amount=Decimal("100.00"))
    make_proposal_item(proposal=proposal)

    client = APIClient()
    client.force_authenticate(user=sales)
    resp = client.post(f"/api/proposals/{proposal.id}/finalize/", {}, format="json")
    assert resp.status_code == 200

    contract = Contract.objects.get(proposal=proposal)
    plan = PaymentPlan.objects.get(contract=contract)
    assert plan.installments.count() >= 1

    reservations = StockReservation.objects.filter(contract=contract)
    assert reservations.count() == 1


def test_finalize_is_idempotent(
    users,
    make_proposal,
    make_proposal_item,
    settings,
    tmp_path,
):
    settings.MEDIA_ROOT = tmp_path

    sales = users["SALES"]
    proposal = make_proposal(owner=sales, total_amount=Decimal("100.00"))
    make_proposal_item(proposal=proposal)

    client = APIClient()
    client.force_authenticate(user=sales)
    resp1 = client.post(f"/api/proposals/{proposal.id}/finalize/", {}, format="json")
    assert resp1.status_code == 200
    resp2 = client.post(f"/api/proposals/{proposal.id}/finalize/", {}, format="json")
    assert resp2.status_code == 200

    assert Contract.objects.filter(proposal=proposal).count() == 1
    contract = Contract.objects.get(proposal=proposal)
    assert PaymentPlan.objects.filter(contract=contract).count() == 1
    assert StockReservation.objects.filter(contract=contract).count() == 1


def test_release_expired_reservations(make_stock_reservation):
    reservation = make_stock_reservation(
        expires_at=timezone.now() - timedelta(days=1),
    )
    slab = reservation.slab
    slab.soft_reserved_for = reservation.contract
    slab.soft_reserved_until = timezone.now() - timedelta(days=1)
    slab.save(update_fields=["soft_reserved_for", "soft_reserved_until"])

    call_command("release_expired_reservations")
    reservation.refresh_from_db()
    slab.refresh_from_db()

    assert reservation.status == "RELEASED"
    assert reservation.release_reason == "Süre doldu"
    assert slab.soft_reserved_for is None
    assert slab.soft_reserved_until is None


def test_contract_signed_moves_to_hard_reserved(make_stock_reservation):
    reservation = make_stock_reservation()
    contract = reservation.contract
    slab = reservation.slab

    contract.status = "IMZALANDI"
    contract.save(update_fields=["status"])

    reservation.refresh_from_db()
    slab.refresh_from_db()

    assert reservation.status == "HARD_RESERVED"
    assert slab.status == "RESERVED"
    assert slab.reserved_for_id == contract.id
    assert slab.soft_reserved_for is None
    assert slab.soft_reserved_until is None
