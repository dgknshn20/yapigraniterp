import itertools
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import User
from apps.crm.models import Customer, Proposal, ProposalItem
from apps.production.models import Contract
from apps.finance.models import Account, Transaction, Cheque, PaymentPlan, FixedExpense
from apps.inventory.models import ProductDefinition, Slab, StockReservation
from apps.hr.models import Employee, Payroll


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def seq():
    counter = itertools.count(1)
    return lambda: next(counter)


@pytest.fixture
def make_user(seq):
    def _make_user(role, username=None):
        name = username or f"{role.lower()}_{seq()}"
        return User.objects.create_user(username=name, password="pass", role=role)

    return _make_user


@pytest.fixture
def users(make_user):
    return {
        "ADMIN": make_user("ADMIN", "admin"),
        "SALES": make_user("SALES", "sales"),
        "FINANCE": make_user("FINANCE", "finance"),
        "PRODUCTION": make_user("PRODUCTION", "production"),
    }


@pytest.fixture
def make_customer(seq):
    def _make_customer(owner=None, **kwargs):
        suffix = seq()
        payload = {
            "name": f"Customer {suffix}",
            "phone": f"555{suffix:04d}",
            "owner": owner,
        }
        payload.update(kwargs)
        return Customer.objects.create(**payload)

    return _make_customer


@pytest.fixture
def make_proposal(make_customer):
    def _make_proposal(customer=None, owner=None, **kwargs):
        if customer is None:
            customer = make_customer(owner=owner)
        payload = {"customer": customer}
        payload.update(kwargs)
        return Proposal.objects.create(**payload)

    return _make_proposal


@pytest.fixture
def make_product(seq):
    def _make_product(**kwargs):
        suffix = seq()
        payload = {
            "name": f"Product {suffix}",
            "code": f"CODE-{suffix}",
        }
        payload.update(kwargs)
        return ProductDefinition.objects.create(**payload)

    return _make_product


@pytest.fixture
def make_proposal_item(make_proposal, make_product):
    def _make_proposal_item(proposal=None, product=None, **kwargs):
        if proposal is None:
            proposal = make_proposal()
        if product is None:
            product = make_product()
        payload = {
            "proposal": proposal,
            "product": product,
            "unit_price": Decimal("100.00"),
            "width": Decimal("1.00"),
            "length": Decimal("1.00"),
            "quantity": 1,
            "fire_rate": Decimal("10.00"),
            "labor_cost": Decimal("0.00"),
        }
        payload.update(kwargs)
        return ProposalItem.objects.create(**payload)

    return _make_proposal_item


@pytest.fixture
def make_contract(make_proposal):
    def _make_contract(proposal=None, owner=None, **kwargs):
        if proposal is None:
            proposal = make_proposal(owner=owner)
        payload = {"proposal": proposal}
        payload.update(kwargs)
        return Contract.objects.create(**payload)

    return _make_contract


@pytest.fixture
def make_account(seq):
    def _make_account(**kwargs):
        suffix = seq()
        payload = {
            "name": f"Account {suffix}",
            "account_type": "CASH",
            "currency": "TRY",
            "initial_balance": Decimal("0.00"),
        }
        payload.update(kwargs)
        return Account.objects.create(**payload)

    return _make_account


@pytest.fixture
def make_transaction(make_account):
    def _make_transaction(account=None, **kwargs):
        if account is None:
            account = make_account()
        payload = {
            "transaction_type": "INCOME",
            "amount": Decimal("100.00"),
            "description": "Test transaction",
            "target_account": account,
        }
        payload.update(kwargs)
        return Transaction.objects.create(**payload)

    return _make_transaction


@pytest.fixture
def make_cheque(seq, make_customer):
    def _make_cheque(customer=None, **kwargs):
        if customer is None:
            customer = make_customer()
        suffix = seq()
        payload = {
            "serial_number": f"CHK-{suffix}",
            "drawer": "Drawer",
            "amount": Decimal("50.00"),
            "currency": "TRY",
            "due_date": timezone.localdate(),
            "received_from_customer": customer,
        }
        payload.update(kwargs)
        return Cheque.objects.create(**payload)

    return _make_cheque


@pytest.fixture
def make_payment_plan(make_contract):
    def _make_payment_plan(contract=None, **kwargs):
        if contract is None:
            contract = make_contract()
        payload = {
            "contract": contract,
            "total_amount": Decimal("100.00"),
        }
        payload.update(kwargs)
        return PaymentPlan.objects.create(**payload)

    return _make_payment_plan


@pytest.fixture
def make_fixed_expense(seq):
    def _make_fixed_expense(**kwargs):
        suffix = seq()
        payload = {
            "name": f"Expense {suffix}",
            "amount": Decimal("10.00"),
        }
        payload.update(kwargs)
        return FixedExpense.objects.create(**payload)

    return _make_fixed_expense


@pytest.fixture
def make_slab(seq, make_product):
    def _make_slab(product=None, **kwargs):
        if product is None:
            product = make_product()
        suffix = seq()
        payload = {
            "product": product,
            "barcode": f"SLAB-{suffix}",
            "width": Decimal("100.00"),
            "length": Decimal("200.00"),
            "thickness": Decimal("2.00"),
        }
        payload.update(kwargs)
        return Slab.objects.create(**payload)

    return _make_slab


@pytest.fixture
def make_employee(seq):
    def _make_employee(**kwargs):
        suffix = seq()
        payload = {
            "first_name": f"Emp{suffix}",
            "last_name": "Test",
            "base_salary": Decimal("1000.00"),
        }
        payload.update(kwargs)
        return Employee.objects.create(**payload)

    return _make_employee


@pytest.fixture
def make_payroll(make_employee):
    def _make_payroll(employee=None, **kwargs):
        if employee is None:
            employee = make_employee()
        payload = {
            "employee": employee,
            "year": 2025,
            "month": 1,
            "base_salary": Decimal("1000.00"),
        }
        payload.update(kwargs)
        return Payroll.objects.create(**payload)

    return _make_payroll


@pytest.fixture
def make_stock_reservation(make_contract, make_proposal_item, make_slab):
    def _make_stock_reservation(contract=None, proposal_item=None, slab=None, **kwargs):
        if proposal_item is None:
            proposal_item = make_proposal_item()
        if contract is None:
            contract = make_contract(proposal=proposal_item.proposal)
        if slab is None:
            slab = make_slab(product=proposal_item.product)
        payload = {
            "contract": contract,
            "proposal_item": proposal_item,
            "product": proposal_item.product,
            "slab": slab,
            "area_m2": Decimal("1.0000"),
            "status": "SOFT_RESERVED",
        }
        payload.update(kwargs)
        return StockReservation.objects.create(**payload)

    return _make_stock_reservation
