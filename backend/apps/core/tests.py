from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import User
from apps.crm.models import Customer, Proposal, ProposalItem
from apps.finance.models import Account, Transaction, Cheque, PaymentPlan, FixedExpense
from apps.hr.models import Employee, Payroll
from apps.inventory.models import ProductDefinition, Slab
from apps.production.models import Contract


class RBACPermissionTests(TestCase):
    """Ensure RolePermission blocks API access even if UI hides controls."""

    @classmethod
    def setUpTestData(cls):
        cls.users = {
            "ADMIN": User.objects.create_user(
                username="admin",
                password="pass",
                role="ADMIN",
            ),
            "SALES": User.objects.create_user(
                username="sales",
                password="pass",
                role="SALES",
            ),
            "FINANCE": User.objects.create_user(
                username="finance",
                password="pass",
                role="FINANCE",
            ),
            "PRODUCTION": User.objects.create_user(
                username="production",
                password="pass",
                role="PRODUCTION",
            ),
        }

    def setUp(self):
        self.client = APIClient()
        self._seq = 0

    def _next(self):
        self._seq += 1
        return self._seq

    def _new_customer(self, owner=None):
        suffix = self._next()
        return Customer.objects.create(
            name=f"Customer {suffix}",
            phone=f"555{suffix:04d}",
            owner=owner,
        )

    def _new_proposal(self, owner=None):
        customer = self._new_customer(owner=owner)
        return Proposal.objects.create(customer=customer)

    def _new_proposal_item(self, proposal=None):
        if proposal is None:
            proposal = self._new_proposal(owner=self.users["SALES"])
        return ProposalItem.objects.create(
            proposal=proposal,
            unit_price=Decimal("100.00"),
            width=Decimal("1.00"),
            length=Decimal("1.00"),
            quantity=1,
        )

    def _new_contract(self, owner=None):
        proposal = self._new_proposal(owner=owner)
        return Contract.objects.create(proposal=proposal)

    def _new_account(self):
        suffix = self._next()
        return Account.objects.create(
            name=f"Account {suffix}",
            account_type="CASH",
            currency="TRY",
            initial_balance=Decimal("0.00"),
        )

    def _new_transaction(self, account=None):
        if account is None:
            account = self._new_account()
        return Transaction.objects.create(
            transaction_type="INCOME",
            amount=Decimal("100.00"),
            description="Test transaction",
            target_account=account,
        )

    def _new_cheque(self):
        suffix = self._next()
        return Cheque.objects.create(
            serial_number=f"CHK-{suffix}",
            drawer="Drawer",
            amount=Decimal("50.00"),
            due_date=timezone.localdate(),
        )

    def _new_payment_plan(self):
        contract = self._new_contract(owner=self.users["SALES"])
        return PaymentPlan.objects.create(
            contract=contract,
            total_amount=Decimal("100.00"),
        )

    def _new_fixed_expense(self):
        suffix = self._next()
        return FixedExpense.objects.create(
            name=f"Expense {suffix}",
            amount=Decimal("10.00"),
        )

    def _new_product(self):
        suffix = self._next()
        return ProductDefinition.objects.create(
            name=f"Product {suffix}",
            code=f"CODE-{suffix}",
        )

    def _new_slab(self, product=None):
        if product is None:
            product = self._new_product()
        suffix = self._next()
        return Slab.objects.create(
            product=product,
            barcode=f"SLAB-{suffix}",
            width=Decimal("100.00"),
            length=Decimal("200.00"),
            thickness=Decimal("2.00"),
        )

    def _new_employee(self):
        suffix = self._next()
        return Employee.objects.create(
            first_name=f"Emp{suffix}",
            last_name="Test",
            base_salary=Decimal("1000.00"),
        )

    def _new_payroll(self, employee=None):
        if employee is None:
            employee = self._new_employee()
        return Payroll.objects.create(
            employee=employee,
            year=2025,
            month=1,
            base_salary=Decimal("1000.00"),
        )

    def _resource_specs(self):
        return [
            {
                "name": "customers",
                "list_url": "/api/customers/",
                "read_roles": {"ADMIN", "SALES", "FINANCE"},
                "write_roles": {"ADMIN", "SALES"},
                "create_payload": lambda: {
                    "name": f"Customer {self._next()}",
                    "phone": f"555{self._next():04d}",
                },
                "update_payload": lambda: {"name": f"Customer Updated {self._next()}"},
                "create_instance": lambda: self._new_customer(owner=self.users["SALES"]),
            },
            {
                "name": "proposals",
                "list_url": "/api/proposals/",
                "read_roles": {"ADMIN", "SALES"},
                "write_roles": {"ADMIN", "SALES"},
                "create_payload": lambda: {
                    "customer": self._new_customer(owner=self.users["SALES"]).id,
                },
                "update_payload": lambda: {"notes": "Updated proposal"},
                "create_instance": lambda: self._new_proposal(owner=self.users["SALES"]),
            },
            {
                "name": "proposal-items",
                "list_url": "/api/proposal-items/",
                "read_roles": {"ADMIN", "SALES"},
                "write_roles": {"ADMIN", "SALES"},
                "create_payload": lambda: {
                    "proposal": self._new_proposal(owner=self.users["SALES"]).id,
                    "unit_price": "100.00",
                    "width": "1.00",
                    "length": "1.00",
                    "quantity": 1,
                },
                "update_payload": lambda: {"description": "Updated item"},
                "create_instance": lambda: self._new_proposal_item(),
            },
            {
                "name": "contracts",
                "list_url": "/api/contracts/",
                "read_roles": {"ADMIN", "SALES", "FINANCE", "PRODUCTION"},
                "write_roles": {"ADMIN", "SALES"},
                "create_payload": lambda: {
                    "proposal": self._new_proposal(owner=self.users["SALES"]).id,
                },
                "update_payload": lambda: {"project_name": "Updated project"},
                "create_instance": lambda: self._new_contract(owner=self.users["SALES"]),
            },
            {
                "name": "accounts",
                "list_url": "/api/accounts/",
                "read_roles": {"ADMIN", "FINANCE"},
                "write_roles": {"ADMIN", "FINANCE"},
                "create_payload": lambda: {
                    "name": f"Account {self._next()}",
                    "account_type": "CASH",
                    "currency": "TRY",
                    "initial_balance": "0.00",
                },
                "update_payload": lambda: {"name": f"Account Updated {self._next()}"},
                "create_instance": lambda: self._new_account(),
            },
            {
                "name": "transactions",
                "list_url": "/api/transactions/",
                "read_roles": {"ADMIN", "FINANCE"},
                "write_roles": {"ADMIN", "FINANCE"},
                "create_payload": lambda: {
                    "transaction_type": "INCOME",
                    "amount": "100.00",
                    "description": "Test transaction",
                    "target_account": self._new_account().id,
                },
                "update_payload": lambda: {"description": "Updated transaction"},
                "create_instance": lambda: self._new_transaction(),
            },
            {
                "name": "cheques",
                "list_url": "/api/cheques/",
                "read_roles": {"ADMIN", "FINANCE"},
                "write_roles": {"ADMIN", "FINANCE"},
                "create_payload": lambda: {
                    "serial_number": f"CHK-{self._next()}",
                    "drawer": "Drawer",
                    "amount": "50.00",
                    "due_date": str(timezone.localdate()),
                },
                "update_payload": lambda: {"current_location": "Vault"},
                "create_instance": lambda: self._new_cheque(),
            },
            {
                "name": "payment-plans",
                "list_url": "/api/payment-plans/",
                "read_roles": {"ADMIN", "FINANCE"},
                "write_roles": {"ADMIN", "FINANCE"},
                "create_payload": lambda: {
                    "contract": self._new_contract(owner=self.users["SALES"]).id,
                    "total_amount": "100.00",
                },
                "update_payload": lambda: {"total_amount": "200.00"},
                "create_instance": lambda: self._new_payment_plan(),
            },
            {
                "name": "fixed-expenses",
                "list_url": "/api/fixed-expenses/",
                "read_roles": {"ADMIN", "FINANCE"},
                "write_roles": {"ADMIN", "FINANCE"},
                "create_payload": lambda: {
                    "name": f"Expense {self._next()}",
                    "amount": "10.00",
                },
                "update_payload": lambda: {"notes": "Updated expense"},
                "create_instance": lambda: self._new_fixed_expense(),
            },
            {
                "name": "product-definitions",
                "list_url": "/api/product-definitions/",
                "read_roles": {"ADMIN", "SALES", "PRODUCTION"},
                "write_roles": {"ADMIN"},
                "create_payload": lambda: {
                    "name": f"Product {self._next()}",
                    "code": f"CODE-{self._next()}",
                },
                "update_payload": lambda: {"description": "Updated product"},
                "create_instance": lambda: self._new_product(),
            },
            {
                "name": "slabs",
                "list_url": "/api/slabs/",
                "read_roles": {"ADMIN", "SALES", "PRODUCTION"},
                "write_roles": {"ADMIN", "PRODUCTION"},
                "create_payload": lambda: {
                    "product": self._new_product().id,
                    "barcode": f"SLAB-{self._next()}",
                    "width": "100.00",
                    "length": "200.00",
                    "thickness": "2.00",
                },
                "update_payload": lambda: {"warehouse_location": "A1"},
                "create_instance": lambda: self._new_slab(),
            },
            {
                "name": "employees",
                "list_url": "/api/employees/",
                "read_roles": {"ADMIN"},
                "write_roles": {"ADMIN"},
                "create_payload": lambda: {
                    "first_name": f"Emp{self._next()}",
                    "last_name": "Test",
                    "base_salary": "1000.00",
                },
                "update_payload": lambda: {"phone": "5551234"},
                "create_instance": lambda: self._new_employee(),
            },
            {
                "name": "payrolls",
                "list_url": "/api/payrolls/",
                "read_roles": {"ADMIN"},
                "write_roles": {"ADMIN"},
                "create_payload": lambda: {
                    "employee": self._new_employee().id,
                    "year": 2025,
                    "month": 1,
                    "base_salary": "1000.00",
                },
                "update_payload": lambda: {"note": "Updated payroll"},
                "create_instance": lambda: self._new_payroll(),
            },
        ]

    def test_role_permission_matrix(self):
        for role, user in self.users.items():
            self.client.force_authenticate(user=user)
            for spec in self._resource_specs():
                list_url = spec["list_url"]
                detail_url = lambda obj_id, base=list_url: f"{base}{obj_id}/"
                can_read = role in spec["read_roles"] or role == "ADMIN"
                can_write = role in spec["write_roles"] or role == "ADMIN"

                with self.subTest(role=role, resource=spec["name"], action="GET"):
                    response = self.client.get(list_url)
                    self.assertEqual(response.status_code, 200 if can_read else 403)

                with self.subTest(role=role, resource=spec["name"], action="POST"):
                    payload = spec["create_payload"]()
                    response = self.client.post(list_url, payload, format="json")
                    self.assertEqual(response.status_code, 201 if can_write else 403)

                with self.subTest(role=role, resource=spec["name"], action="PATCH"):
                    instance = spec["create_instance"]()
                    response = self.client.patch(
                        detail_url(instance.id),
                        spec["update_payload"](),
                        format="json",
                    )
                    self.assertEqual(response.status_code, 200 if can_write else 403)

                with self.subTest(role=role, resource=spec["name"], action="DELETE"):
                    instance = spec["create_instance"]()
                    response = self.client.delete(detail_url(instance.id))
                    self.assertEqual(response.status_code, 204 if can_write else 403)
