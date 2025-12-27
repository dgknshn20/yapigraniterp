from decimal import Decimal

import pytest
from rest_framework.test import APIClient


pytestmark = pytest.mark.django_db


def test_customer_detail_masking_for_sales(users, make_customer, make_account, make_transaction, make_cheque):
    sales = users["SALES"]
    customer = make_customer(owner=sales, risk_limit=Decimal("1000.00"))
    account = make_account()
    make_transaction(account=account, related_customer=customer)
    make_cheque(customer=customer)

    client = APIClient()
    client.force_authenticate(user=sales)
    resp = client.get(f"/api/customers/{customer.id}/")
    assert resp.status_code == 200
    data = resp.json()

    for key in ("risk_limit", "balance", "last_transactions", "payment_installments", "cheques"):
        assert key not in data


def test_contract_masking_for_production(users, make_contract):
    production = users["PRODUCTION"]
    contract = make_contract(
        owner=users["SALES"],
        items_snapshot=[
            {
                "product_name": "Test",
                "unit_price": "10.00",
                "labor_cost": "1.00",
                "total_price": "11.00",
                "fire_rate": "10.00",
            }
        ],
        total_amount=Decimal("100.00"),
        tax_amount=Decimal("20.00"),
        subtotal_amount=Decimal("80.00"),
        discount_amount=Decimal("0.00"),
        currency="TRY",
    )

    client = APIClient()
    client.force_authenticate(user=production)
    resp = client.get("/api/contracts/")
    assert resp.status_code == 200
    payload = next(item for item in resp.json() if item["id"] == contract.id)

    for key in (
        "subtotal_amount",
        "tax_amount",
        "discount_amount",
        "total_amount",
        "currency",
        "include_tax",
        "tax_rate",
        "contract_file",
        "contract_file_url",
    ):
        assert key not in payload

    snapshot = payload.get("items_snapshot") or []
    if snapshot:
        for item in snapshot:
            assert "unit_price" not in item
            assert "labor_cost" not in item
            assert "total_price" not in item
            assert "fire_rate" not in item


def test_dashboard_stats_masking(users):
    sales = users["SALES"]
    production = users["PRODUCTION"]
    finance = users["FINANCE"]

    client = APIClient()

    client.force_authenticate(user=sales)
    resp = client.get("/api/dashboard/stats/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["finance"] is None
    assert data["recent_activity"] == []

    client.force_authenticate(user=production)
    resp = client.get("/api/dashboard/stats/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["finance"] is None
    assert data["sales"] is None
    assert data["recent_activity"] == []

    client.force_authenticate(user=finance)
    resp = client.get("/api/dashboard/stats/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["sales"] is None
