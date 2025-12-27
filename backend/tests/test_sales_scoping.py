import pytest
from rest_framework.test import APIClient

from apps.core.models import User


pytestmark = pytest.mark.django_db


def test_sales_scoping_on_customers(users, make_customer):
    sales = users["SALES"]
    other_sales = User.objects.create_user(username="sales_other", password="pass", role="SALES")
    own_customer = make_customer(owner=sales)
    other_customer = make_customer(owner=other_sales)

    client = APIClient()
    client.force_authenticate(user=sales)
    resp = client.get("/api/customers/")
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()}
    assert own_customer.id in ids
    assert other_customer.id not in ids


def test_sales_scoping_on_proposals(users, make_proposal):
    sales = users["SALES"]
    other_sales = User.objects.create_user(username="sales_other2", password="pass", role="SALES")
    own_proposal = make_proposal(owner=sales)
    other_proposal = make_proposal(owner=other_sales)

    client = APIClient()
    client.force_authenticate(user=sales)
    resp = client.get("/api/proposals/")
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()}
    assert own_proposal.id in ids
    assert other_proposal.id not in ids


def test_sales_scoping_on_proposal_items(users, make_proposal, make_proposal_item):
    sales = users["SALES"]
    other_sales = User.objects.create_user(username="sales_other3", password="pass", role="SALES")
    own_item = make_proposal_item(proposal=make_proposal(owner=sales))
    other_item = make_proposal_item(proposal=make_proposal(owner=other_sales))

    client = APIClient()
    client.force_authenticate(user=sales)
    resp = client.get("/api/proposal-items/")
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()}
    assert own_item.id in ids
    assert other_item.id not in ids


def test_sales_scoping_on_contracts(users, make_contract):
    sales = users["SALES"]
    other_sales = User.objects.create_user(username="sales_other4", password="pass", role="SALES")
    own_contract = make_contract(owner=sales)
    other_contract = make_contract(owner=other_sales)

    client = APIClient()
    client.force_authenticate(user=sales)
    resp = client.get("/api/contracts/")
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()}
    assert own_contract.id in ids
    assert other_contract.id not in ids
