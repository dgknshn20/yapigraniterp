from rest_framework.routers import DefaultRouter
from django.urls import path
from apps.finance.api import TransactionViewSet, AccountViewSet, ChequeViewSet, PaymentPlanViewSet, FixedExpenseViewSet, FinanceInsightsViewSet
from apps.crm.api import ProposalViewSet, ProposalItemViewSet, CustomerViewSet
from apps.production.api import ContractViewSet
from apps.inventory.api import ProductDefinitionViewSet, SlabViewSet

from apps.hr.api import EmployeeViewSet, PayrollViewSet
from apps.core.api import DashboardStatsView, NotificationViewSet, CurrentUserView

router = DefaultRouter()
router.register(r"customers", CustomerViewSet, basename="customer")
router.register(r"accounts", AccountViewSet, basename="account")
router.register(r"transactions", TransactionViewSet, basename="transaction")
router.register(r"cheques", ChequeViewSet, basename="cheque")
router.register(r"payment-plans", PaymentPlanViewSet, basename="paymentplan")
router.register(r"fixed-expenses", FixedExpenseViewSet, basename="fixedexpense")
router.register(r"finance", FinanceInsightsViewSet, basename="finance-insights")
router.register(r"proposals", ProposalViewSet, basename="proposal")
router.register(r"proposal-items", ProposalItemViewSet, basename="proposalitem")
router.register(r"contracts", ContractViewSet, basename="contract")
router.register(r"product-definitions", ProductDefinitionViewSet, basename="productdefinition")
router.register(r"slabs", SlabViewSet, basename="slab")
router.register(r"employees", EmployeeViewSet, basename="employee")
router.register(r"payrolls", PayrollViewSet, basename="payroll")
router.register(r"notifications", NotificationViewSet, basename="notification")

urlpatterns = [
	*router.urls,
	path("dashboard/stats/", DashboardStatsView.as_view(), name="dashboard-stats"),
	path("auth/me/", CurrentUserView.as_view(), name="auth-me"),
]
