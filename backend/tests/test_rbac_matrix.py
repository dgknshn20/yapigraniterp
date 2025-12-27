from decimal import Decimal
import uuid

import pytest
from rest_framework.test import APIClient


pytestmark = pytest.mark.django_db


def _uniq(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def test_role_rbac_matrix(users, make_customer, make_proposal, make_proposal_item, make_contract,
                          make_account, make_transaction, make_cheque, make_payment_plan,
                          make_fixed_expense, make_product, make_slab, make_employee, make_payroll):
    specs = [
        {
            "name": "customers",
            "list_url": "/api/customers/",
            "read_roles": {"ADMIN", "SALES", "FINANCE"},
            "write_roles": {"ADMIN", "SALES"},
            "create_payload": lambda user: {
                "name": _uniq("customer"),
                "phone": f"555{uuid.uuid4().hex[:4]}",
            },
            "update_payload": lambda user: {"name": "Customer Updated"},
            "create_instance": lambda user: make_customer(owner=user if user.role == "SALES" else None),
        },
        {
            "name": "proposals",
            "list_url": "/api/proposals/",
            "read_roles": {"ADMIN", "SALES"},
            "write_roles": {"ADMIN", "SALES"},
            "create_payload": lambda user: {
                "customer": make_customer(owner=user if user.role == "SALES" else None).id,
            },
            "update_payload": lambda user: {"notes": "Updated proposal"},
            "create_instance": lambda user: make_proposal(owner=user if user.role == "SALES" else None),
        },
        {
            "name": "proposal-items",
            "list_url": "/api/proposal-items/",
            "read_roles": {"ADMIN", "SALES"},
            "write_roles": {"ADMIN", "SALES"},
            "create_payload": lambda user: {
                "proposal": make_proposal(owner=user if user.role == "SALES" else None).id,
                "unit_price": "100.00",
                "width": "1.00",
                "length": "1.00",
                "quantity": 1,
            },
            "update_payload": lambda user: {"description": "Updated item"},
            "create_instance": lambda user: make_proposal_item(
                proposal=make_proposal(owner=user if user.role == "SALES" else None),
            ),
        },
        {
            "name": "contracts",
            "list_url": "/api/contracts/",
            "read_roles": {"ADMIN", "SALES", "FINANCE", "PRODUCTION"},
            "write_roles": {"ADMIN", "SALES"},
            "create_payload": lambda user: {
                "proposal": make_proposal(owner=user if user.role == "SALES" else None).id,
            },
            "update_payload": lambda user: {"project_name": "Updated project"},
            "create_instance": lambda user: make_contract(owner=user if user.role == "SALES" else None),
        },
        {
            "name": "accounts",
            "list_url": "/api/accounts/",
            "read_roles": {"ADMIN", "FINANCE"},
            "write_roles": {"ADMIN", "FINANCE"},
            "create_payload": lambda user: {
                "name": _uniq("account"),
                "account_type": "CASH",
                "currency": "TRY",
                "initial_balance": "0.00",
            },
            "update_payload": lambda user: {"name": "Account Updated"},
            "create_instance": lambda user: make_account(),
        },
        {
            "name": "transactions",
            "list_url": "/api/transactions/",
            "read_roles": {"ADMIN", "FINANCE"},
            "write_roles": {"ADMIN", "FINANCE"},
            "create_payload": lambda user: {
                "transaction_type": "INCOME",
                "amount": "100.00",
                "description": "Test transaction",
                "target_account": make_account().id,
            },
            "update_payload": lambda user: {"description": "Updated transaction"},
            "create_instance": lambda user: make_transaction(),
        },
        {
            "name": "cheques",
            "list_url": "/api/cheques/",
            "read_roles": {"ADMIN", "FINANCE"},
            "write_roles": {"ADMIN", "FINANCE"},
            "create_payload": lambda user: {
                "serial_number": _uniq("CHK"),
                "drawer": "Drawer",
                "amount": "50.00",
                "due_date": "2025-01-01",
                "received_from_customer": make_customer().id,
            },
            "update_payload": lambda user: {"current_location": "Vault"},
            "create_instance": lambda user: make_cheque(),
        },
        {
            "name": "payment-plans",
            "list_url": "/api/payment-plans/",
            "read_roles": {"ADMIN", "FINANCE"},
            "write_roles": {"ADMIN", "FINANCE"},
            "create_payload": lambda user: {
                "contract": make_contract().id,
                "total_amount": "100.00",
            },
            "update_payload": lambda user: {"total_amount": "200.00"},
            "create_instance": lambda user: make_payment_plan(),
        },
        {
            "name": "fixed-expenses",
            "list_url": "/api/fixed-expenses/",
            "read_roles": {"ADMIN", "FINANCE"},
            "write_roles": {"ADMIN", "FINANCE"},
            "create_payload": lambda user: {
                "name": _uniq("expense"),
                "amount": "10.00",
            },
            "update_payload": lambda user: {"notes": "Updated expense"},
            "create_instance": lambda user: make_fixed_expense(),
        },
        {
            "name": "product-definitions",
            "list_url": "/api/product-definitions/",
            "read_roles": {"ADMIN", "SALES", "PRODUCTION"},
            "write_roles": {"ADMIN"},
            "create_payload": lambda user: {
                "name": _uniq("product"),
                "code": _uniq("code"),
            },
            "update_payload": lambda user: {"description": "Updated product"},
            "create_instance": lambda user: make_product(),
        },
        {
            "name": "slabs",
            "list_url": "/api/slabs/",
            "read_roles": {"ADMIN", "SALES", "PRODUCTION"},
            "write_roles": {"ADMIN", "PRODUCTION"},
            "create_payload": lambda user: {
                "product": make_product().id,
                "barcode": _uniq("slab"),
                "width": "100.00",
                "length": "200.00",
                "thickness": "2.00",
            },
            "update_payload": lambda user: {"warehouse_location": "A1"},
            "create_instance": lambda user: make_slab(),
        },
        {
            "name": "employees",
            "list_url": "/api/employees/",
            "read_roles": {"ADMIN"},
            "write_roles": {"ADMIN"},
            "create_payload": lambda user: {
                "first_name": "Emp",
                "last_name": "Test",
                "base_salary": "1000.00",
            },
            "update_payload": lambda user: {"phone": "5551234"},
            "create_instance": lambda user: make_employee(),
        },
        {
            "name": "payrolls",
            "list_url": "/api/payrolls/",
            "read_roles": {"ADMIN"},
            "write_roles": {"ADMIN"},
            "create_payload": lambda user: {
                "employee": make_employee().id,
                "year": 2025,
                "month": 1,
                "base_salary": str(Decimal("1000.00")),
            },
            "update_payload": lambda user: {"note": "Updated payroll"},
            "create_instance": lambda user: make_payroll(),
        },
    ]

    for role, user in users.items():
        client = APIClient()
        client.force_authenticate(user=user)

        for spec in specs:
            can_read = role in spec["read_roles"] or role == "ADMIN"
            can_write = role in spec["write_roles"] or role == "ADMIN"
            list_url = spec["list_url"]

            response = client.get(list_url)
            assert response.status_code == (200 if can_read else 403)

            response = client.post(list_url, spec["create_payload"](user), format="json")
            assert response.status_code == (201 if can_write else 403)

            instance = spec["create_instance"](user)
            detail_url = f"{list_url}{instance.id}/"
            response = client.patch(detail_url, spec["update_payload"](user), format="json")
            assert response.status_code == (200 if can_write else 403)

            response = client.delete(detail_url)
            assert response.status_code == (204 if can_write else 403)
