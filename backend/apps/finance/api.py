from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.utils import timezone
from django.db.models import Sum
from django.db.models import Q
from datetime import date, timedelta
from decimal import Decimal
from collections import defaultdict
import calendar

from apps.finance.models import Account, Transaction, Cheque, PaymentPlan, PaymentInstallment, FixedExpense
from apps.finance.serializers import (
    AccountSerializer,
    TransactionSerializer,
    ChequeSerializer,
    ChequeActionSerializer,
    PaymentPlanSerializer,
    FixedExpenseSerializer,
)
from apps.finance.utils import export_transactions_to_excel
from apps.core.models import Notification
from apps.finance.services import record_installment_payment
from apps.production.models import Contract
from apps.core.permissions import RolePermission

class AccountViewSet(viewsets.ModelViewSet):
    queryset = Account.objects.all().order_by("name")
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN", "FINANCE"}
    write_roles = {"ADMIN", "FINANCE"}

class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.select_related(
        "source_account",
        "target_account",
        "related_customer",
        "related_contract",
    ).all().order_by("-date", "-id")
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN", "FINANCE"}
    write_roles = {"ADMIN", "FINANCE"}

    def perform_create(self, serializer):
        txn = serializer.save()
        direction = {
            "INCOME": "Tahsilat",
            "EXPENSE": "Ödeme",
            "TRANSFER": "Virman",
        }.get(txn.transaction_type, "İşlem")
        amount_text = f"{txn.amount} {getattr(txn.source_account, 'currency', '') or getattr(txn.target_account, 'currency', '')}".strip()
        message = f"{direction}: {txn.description} • {amount_text}"
        for role in ("FINANCE", "ADMIN"):
            Notification.objects.create(
                recipient_role=role,
                title="Yeni finansal işlem",
                message=message,
                level="INFO",
                related_url="/finance",
            )

    @action(detail=False, methods=["get"])
    def daily_summary(self, request):
        total_income = Transaction.objects.filter(
            transaction_type="INCOME"
        ).aggregate(s=Sum("amount"))["s"] or 0

        total_expense = Transaction.objects.filter(
            transaction_type="EXPENSE"
        ).aggregate(s=Sum("amount"))["s"] or 0

        return Response({
            "total_income": total_income,
            "total_expense": total_expense,
            "net_flow": total_income - total_expense
        })

    @action(detail=False, methods=["get"])
    def export_excel(self, request):
        queryset = self.get_queryset()

        # Optional filters (query params)
        # Examples:
        # /api/transactions/export_excel/?date_after=2025-01-01&date_before=2025-01-31
        # /api/transactions/export_excel/?transaction_type=INCOME
        # /api/transactions/export_excel/?account_id=3
        params = request.query_params

        date_after = params.get("date_after")
        if date_after:
            try:
                queryset = queryset.filter(date__gte=date.fromisoformat(date_after))
            except ValueError:
                return Response(
                    {"error": "Geçersiz date_after formatı. Örn: 2025-01-31"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        date_before = params.get("date_before")
        if date_before:
            try:
                queryset = queryset.filter(date__lte=date.fromisoformat(date_before))
            except ValueError:
                return Response(
                    {"error": "Geçersiz date_before formatı. Örn: 2025-01-31"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        transaction_type = params.get("transaction_type")
        if transaction_type:
            queryset = queryset.filter(transaction_type=transaction_type)

        account_id = params.get("account_id")
        if account_id:
            try:
                account_id_int = int(account_id)
            except ValueError:
                return Response(
                    {"error": "Geçersiz account_id. Sayı olmalı."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = queryset.filter(
                Q(source_account_id=account_id_int) | Q(target_account_id=account_id_int)
            )

        related_customer = params.get("related_customer")
        if related_customer:
            try:
                queryset = queryset.filter(related_customer_id=int(related_customer))
            except ValueError:
                return Response(
                    {"error": "Geçersiz related_customer. Sayı olmalı."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        related_contract = params.get("related_contract")
        if related_contract:
            try:
                queryset = queryset.filter(related_contract_id=int(related_contract))
            except ValueError:
                return Response(
                    {"error": "Geçersiz related_contract. Sayı olmalı."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        amount_min = params.get("amount_min")
        if amount_min:
            try:
                queryset = queryset.filter(amount__gte=amount_min)
            except Exception:
                return Response(
                    {"error": "Geçersiz amount_min."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        amount_max = params.get("amount_max")
        if amount_max:
            try:
                queryset = queryset.filter(amount__lte=amount_max)
            except Exception:
                return Response(
                    {"error": "Geçersiz amount_max."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        return export_transactions_to_excel(queryset)

class ChequeViewSet(viewsets.ModelViewSet):
    """
    API Endpoint: /api/cheques/
    Çek yaşam döngüsü: PORTFOLIO -> ENDORSED/COLLECTED -> İşlem Tamamlandı
    """
    queryset = Cheque.objects.all().order_by('due_date')
    serializer_class = ChequeSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN", "FINANCE"}
    write_roles = {"ADMIN", "FINANCE"}

    def perform_create(self, serializer):
        """
        Yeni çek eklendiğinde (Müşteriden alındığında):
        Çek PORTFOLIO statüsüyle kaydedilir.
        """
        serializer.save(status='PORTFOLIO')

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def endorse(self, request, pk=None):
        """
        /api/cheques/{id}/endorse/
        Çeki Ciro Et (Tedarikçiye Ödeme Yap)
        
        Akış:
        1. Çek PORTFOLIO -> ENDORSED olur
        2. Çekin para miktarı, bir "Çek Portföyü" hesabından tedarikçi hesabına transfer edilir
        """
        cheque = self.get_object()
        serializer = ChequeActionSerializer(data=request.data)
        
        if cheque.status != 'PORTFOLIO':
            return Response(
                {"error": "Sadece portföydeki (bizdeki) çekler ciro edilebilir."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        target_account_id = serializer.validated_data['target_account_id']
        description = serializer.validated_data.get('description', '')
        
        try:
            supplier_account = Account.objects.get(id=target_account_id)
        except Account.DoesNotExist:
            return Response(
                {"error": "Geçersiz tedarikçi hesabı."}, 
                status=status.HTTP_404_NOT_FOUND
            )

        # Çek Portföyü (veya Alınan Çekler) hesabı oluştur/bul
        portfolio_account, _ = Account.objects.get_or_create(
            name="Çek Portföyü",
            defaults={
                'account_type': 'PARTNER',
                'currency': 'TRY',
                'initial_balance': 0
            }
        )

        # 1. Çek Durumunu Güncelle
        cheque.status = 'ENDORSED'
        cheque.given_to_supplier = supplier_account.name
        cheque.save()

        # 2. Finansal İşlem (Transaction) Oluştur
        # Ödeme: Kaynak=Çek Portföyü, Hedef=None (Dış hedef/tedarikçi)
        Transaction.objects.create(
            description=f"Çek Cirosu: {cheque.serial_number} ({cheque.drawer}) -> {supplier_account.name} - {description}",
            amount=cheque.amount,
            date=timezone.now().date(),
            transaction_type='EXPENSE',
            source_account=portfolio_account,
            target_account=None,
            related_customer=cheque.received_from_customer,
        )

        return Response(
            {
                "status": "success",
                "message": f"Çek başarıyla ciro edildi. {cheque.amount} {cheque.currency} {supplier_account.name} kişisine/kurumuna verildi.",
                "cheque_id": cheque.id
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def collect(self, request, pk=None):
        """
        /api/cheques/{id}/collect/
        Çeki Tahsil Et (Bankaya veya Kasaya Yatır)
        
        Akış:
        1. Çek PORTFOLIO -> COLLECTED olur
        2. Çekin para miktarı, müşteri carisi hesabından (alacak azalır) kasa/banka'ya girer
        """
        cheque = self.get_object()
        serializer = ChequeActionSerializer(data=request.data)

        if cheque.status != 'PORTFOLIO':
            return Response(
                {"error": "Sadece portföydeki çekler tahsil edilebilir."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        target_account_id = serializer.validated_data['target_account_id']
        description = serializer.validated_data.get('description', '')
        
        try:
            bank_or_cash = Account.objects.get(id=target_account_id)
        except Account.DoesNotExist:
            return Response(
                {"error": "Geçersiz kasa/banka hesabı."}, 
                status=status.HTTP_404_NOT_FOUND
            )

        if bank_or_cash.currency != cheque.currency:
            return Response(
                {"error": "Hedef hesabın para birimi ile çek para birimi aynı olmalıdır."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Çek Durumunu Güncelle
        cheque.status = 'COLLECTED'
        cheque.save()

        # 2. Finansal İşlem (Transaction) Oluştur
        # Para girişi: Kaynak=None (dış kaynak/müşteri), Hedef=Kasa/Banka
        Transaction.objects.create(
            description=f"Çek Tahsilatı: {cheque.serial_number} ({cheque.drawer}) - {description}",
            amount=cheque.amount,
            date=timezone.now().date(),
            transaction_type='INCOME',
            source_account=None,
            target_account=bank_or_cash,
            related_customer=cheque.received_from_customer,
        )

        return Response(
            {
                "status": "success",
                "message": f"Çek tahsil edildi. {cheque.amount} {cheque.currency} {bank_or_cash.name} hesabına yatırıldı.",
                "cheque_id": cheque.id,
            },
            status=status.HTTP_200_OK,
        )


class PaymentPlanViewSet(viewsets.ModelViewSet):
    queryset = PaymentPlan.objects.select_related("contract", "contract__proposal", "contract__proposal__customer").all().order_by("-id")
    serializer_class = PaymentPlanSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN", "FINANCE"}
    write_roles = {"ADMIN", "FINANCE"}

    @action(detail=True, methods=["post"], url_path="rebuild")
    def rebuild(self, request, pk=None):
        plan = self.get_object()
        plan.build_installments()
        return Response(PaymentPlanSerializer(plan, context={"request": request}).data)

    class PayInstallmentSerializer(serializers.Serializer):
        installment_id = serializers.IntegerField(required=True)
        target_account_id = serializers.IntegerField(required=True)
        description = serializers.CharField(required=False, allow_blank=True)

    @action(detail=True, methods=["post"], url_path="pay-installment")
    @transaction.atomic
    def pay_installment(self, request, pk=None):
        """Mark a single installment as paid and create an INCOME transaction."""

        plan = self.get_object()
        serializer = self.PayInstallmentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        installment_id = serializer.validated_data["installment_id"]
        target_account_id = serializer.validated_data["target_account_id"]
        description = serializer.validated_data.get("description", "")

        try:
            installment = PaymentInstallment.objects.select_for_update().select_related(
                "plan",
                "plan__contract",
                "plan__contract__proposal",
                "plan__contract__proposal__customer",
            ).get(id=installment_id, plan=plan)
        except PaymentInstallment.DoesNotExist:
            return Response({"error": "Geçersiz taksit."}, status=status.HTTP_404_NOT_FOUND)

        if installment.status != "PENDING":
            return Response(
                {"error": "Sadece bekleyen (PENDING) taksitler tahsil edilebilir."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            bank_or_cash = Account.objects.get(id=target_account_id)
        except Account.DoesNotExist:
            return Response({"error": "Geçersiz kasa/banka hesabı."}, status=status.HTTP_404_NOT_FOUND)

        if bank_or_cash.currency != installment.currency:
            return Response(
                {"error": "Hedef hesabın para birimi ile taksit para birimi aynı olmalıdır."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        record_installment_payment(
            installment=installment,
            target_account=bank_or_cash,
            description=description,
        )

        plan.refresh_from_db()
        return Response(PaymentPlanSerializer(plan, context={"request": request}).data)


class FixedExpenseViewSet(viewsets.ModelViewSet):
    queryset = FixedExpense.objects.all().order_by("name", "due_day")
    serializer_class = FixedExpenseSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN", "FINANCE"}
    write_roles = {"ADMIN", "FINANCE"}


class FinanceInsightsViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN", "FINANCE"}

    def get_permissions(self):
        if self.action == "project_profitability":
            self.read_roles = {"ADMIN"}
        else:
            self.read_roles = {"ADMIN", "FINANCE"}
        return [IsAuthenticated(), RolePermission()]

    def _parse_days(self, request):
        raw = request.query_params.get("days", "30,60,90")
        days_list = []
        for part in raw.split(","):
            part = part.strip()
            if not part:
                continue
            try:
                days_list.append(max(1, int(part)))
            except ValueError:
                continue
        return days_list or [30, 60, 90]

    def _month_iterator(self, start_date, end_date):
        cursor = date(start_date.year, start_date.month, 1)
        end_marker = date(end_date.year, end_date.month, 1)
        while cursor <= end_marker:
            yield cursor
            month = cursor.month + 1
            year = cursor.year + (month - 1) // 12
            month = ((month - 1) % 12) + 1
            cursor = date(year, month, 1)

    def _cash_balances(self):
        cash_accounts = Account.objects.filter(account_type__in=["CASH", "BANK", "POS"])
        initial = cash_accounts.values("currency").annotate(total=Sum("initial_balance"))
        incoming = (
            Transaction.objects.filter(target_account__in=cash_accounts)
            .values("target_account__currency")
            .annotate(total=Sum("amount"))
        )
        outgoing = (
            Transaction.objects.filter(source_account__in=cash_accounts)
            .values("source_account__currency")
            .annotate(total=Sum("amount"))
        )

        totals = defaultdict(Decimal)
        for row in initial:
            totals[row["currency"]] += row["total"] or Decimal("0")
        for row in incoming:
            totals[row["target_account__currency"]] += row["total"] or Decimal("0")
        for row in outgoing:
            totals[row["source_account__currency"]] -= row["total"] or Decimal("0")
        return totals

    def _sum_by_currency(self, items):
        totals = defaultdict(Decimal)
        for item in items:
            currency = item.get("currency")
            if not currency:
                continue
            totals[currency] += item.get("amount") or Decimal("0")
        return totals

    def _fixed_expense_occurrences(self, start_date, end_date):
        items = []
        expenses = FixedExpense.objects.filter(is_active=True).order_by("name")
        for expense in expenses:
            active_start = max(start_date, expense.start_date or start_date)
            active_end = end_date
            if expense.end_date:
                active_end = min(active_end, expense.end_date)
            if active_end < active_start:
                continue

            for month_start in self._month_iterator(active_start, active_end):
                last_day = calendar.monthrange(month_start.year, month_start.month)[1]
                day = min(int(expense.due_day or 1), last_day)
                due_date = date(month_start.year, month_start.month, day)
                if due_date < active_start or due_date > active_end:
                    continue
                items.append(
                    {
                        "id": expense.id,
                        "name": expense.name,
                        "amount": expense.amount,
                        "currency": expense.currency,
                        "due_date": due_date,
                        "notes": expense.notes,
                    }
                )
        items.sort(key=lambda x: (x["due_date"], x["name"]))
        return items

    def _build_forecast(self, days):
        today = timezone.localdate()
        end_date = today + timedelta(days=days)

        starting_cash = self._cash_balances()

        installments = (
            PaymentInstallment.objects.select_related(
                "plan",
                "plan__contract",
                "plan__contract__proposal",
                "plan__contract__proposal__customer",
            )
            .filter(status="PENDING", due_date__gte=today, due_date__lte=end_date)
            .order_by("due_date")
        )
        installment_items = [
            {
                "id": inst.id,
                "due_date": inst.due_date,
                "amount": inst.amount,
                "currency": inst.currency,
                "installment_no": inst.installment_no,
                "plan_id": inst.plan_id,
                "contract_id": inst.plan.contract_id if inst.plan else None,
                "project_name": getattr(inst.plan.contract, "project_name", "") if inst.plan else "",
                "customer_name": getattr(inst.plan.contract, "customer_name", "")
                if inst.plan and inst.plan.contract
                else "",
            }
            for inst in installments
        ]

        cheques = (
            Cheque.objects.filter(status__in=["PORTFOLIO", "BANK"], due_date__gte=today, due_date__lte=end_date)
            .order_by("due_date")
        )
        cheque_items = [
            {
                "id": chq.id,
                "serial_number": chq.serial_number,
                "drawer": chq.drawer,
                "due_date": chq.due_date,
                "amount": chq.amount,
                "currency": chq.currency,
                "status": chq.status,
            }
            for chq in cheques
        ]

        fixed_items = self._fixed_expense_occurrences(today, end_date)

        installment_totals = self._sum_by_currency(installment_items)
        cheque_totals = self._sum_by_currency(cheque_items)
        fixed_totals = self._sum_by_currency(fixed_items)

        currencies = set(starting_cash.keys()) | set(installment_totals.keys()) | set(cheque_totals.keys()) | set(fixed_totals.keys())
        summary = []
        for currency in sorted(currencies):
            start_value = starting_cash.get(currency, Decimal("0"))
            expected_collections = installment_totals.get(currency, Decimal("0"))
            cheque_due = cheque_totals.get(currency, Decimal("0"))
            fixed_expenses = fixed_totals.get(currency, Decimal("0"))
            projected_cash = start_value + expected_collections + cheque_due - fixed_expenses
            summary.append(
                {
                    "currency": currency,
                    "starting_cash": start_value,
                    "expected_collections": expected_collections,
                    "cheque_due": cheque_due,
                    "fixed_expenses": fixed_expenses,
                    "projected_cash": projected_cash,
                }
            )

        return {
            "days": days,
            "period_start": today,
            "period_end": end_date,
            "summary": summary,
            "expected_collections": installment_items,
            "cheques_due": cheque_items,
            "fixed_expenses": fixed_items,
        }

    def _notify_once(self, title, message, level="WARNING", related_url="/finance"):
        since = timezone.now() - timedelta(hours=24)
        if Notification.objects.filter(title=title, message=message, created_at__gte=since).exists():
            return
        for role in ("FINANCE", "ADMIN"):
            Notification.objects.create(
                recipient_role=role,
                title=title,
                message=message,
                level=level,
                related_url=related_url,
            )

    @action(detail=False, methods=["get"], url_path="cashflow-forecast")
    def cashflow_forecast(self, request):
        forecasts = [self._build_forecast(days) for days in self._parse_days(request)]
        return Response(
            {
                "as_of": timezone.localdate(),
                "forecasts": forecasts,
            }
        )

    @action(detail=False, methods=["get"], url_path="project-profitability")
    def project_profitability(self, request):
        contracts = Contract.objects.select_related("proposal", "proposal__customer").all().order_by("-id")
        contract_ids = list(contracts.values_list("id", flat=True))

        totals = defaultdict(Decimal)
        if contract_ids:
            aggregates = (
                Transaction.objects.filter(related_contract_id__in=contract_ids)
                .values("related_contract_id", "transaction_type")
                .annotate(total=Sum("amount"))
            )
            for row in aggregates:
                totals[(row["related_contract_id"], row["transaction_type"])] = row["total"] or Decimal("0")

        items = []
        for contract in contracts:
            proposal = contract.proposal
            expected_revenue = getattr(contract, "total_amount", None) or (proposal.grand_total if proposal else Decimal("0"))
            actual_income = totals.get((contract.id, "INCOME"), Decimal("0"))
            actual_expense = totals.get((contract.id, "EXPENSE"), Decimal("0"))
            net_profit = actual_income - actual_expense
            variance = actual_income - expected_revenue
            items.append(
                {
                    "contract_id": contract.id,
                    "project_name": contract.project_name or "",
                    "customer_name": getattr(contract, "customer_name", None)
                    or (proposal.customer.name if proposal and proposal.customer else ""),
                    "proposal_number": proposal.proposal_number if proposal else "",
                    "status": contract.status,
                    "currency": getattr(contract, "currency", None) or (proposal.currency if proposal else ""),
                    "expected_revenue": expected_revenue,
                    "actual_income": actual_income,
                    "actual_cost": actual_expense,
                    "net_profit": net_profit,
                    "variance": variance,
                }
            )

        return Response({"as_of": timezone.localdate(), "items": items})

    @action(detail=False, methods=["get"], url_path="alerts")
    def alerts(self, request):
        today = timezone.localdate()
        window_days = int(request.query_params.get("cheque_window_days", 7))
        window_days = max(1, min(window_days, 30))

        overdue_installments = (
            PaymentInstallment.objects.select_related(
                "plan",
                "plan__contract",
                "plan__contract__proposal",
                "plan__contract__proposal__customer",
            )
            .filter(status="PENDING", due_date__lt=today)
            .order_by("due_date")
        )
        overdue_items = [
            {
                "id": inst.id,
                "due_date": inst.due_date,
                "amount": inst.amount,
                "currency": inst.currency,
                "days_overdue": (today - inst.due_date).days,
                "contract_id": inst.plan.contract_id if inst.plan else None,
                "project_name": getattr(inst.plan.contract, "project_name", "") if inst.plan else "",
                "customer_name": getattr(inst.plan.contract, "customer_name", "")
                if inst.plan and inst.plan.contract
                else "",
            }
            for inst in overdue_installments
        ]

        upcoming_cheques = (
            Cheque.objects.filter(
                status__in=["PORTFOLIO", "BANK"],
                due_date__gte=today,
                due_date__lte=today + timedelta(days=window_days),
            )
            .order_by("due_date")
        )
        cheque_items = [
            {
                "id": chq.id,
                "serial_number": chq.serial_number,
                "drawer": chq.drawer,
                "due_date": chq.due_date,
                "amount": chq.amount,
                "currency": chq.currency,
                "days_to_due": (chq.due_date - today).days,
            }
            for chq in upcoming_cheques
        ]

        negative_balance = []
        for days in (30, 60, 90):
            snapshot = self._build_forecast(days)
            for row in snapshot["summary"]:
                if row["projected_cash"] < 0:
                    negative_balance.append(
                        {
                            "currency": row["currency"],
                            "projected_cash": row["projected_cash"],
                            "days": days,
                        }
                    )

        if overdue_items:
            self._notify_once(
                "Geciken tahsilatlar",
                f"{len(overdue_items)} adet geciken tahsilat var.",
                level="WARNING",
            )
        if cheque_items:
            self._notify_once(
                "Vadesi yaklaşan çekler",
                f"{len(cheque_items)} adet çek vadeye yaklaştı.",
                level="WARNING",
            )
        if negative_balance:
            self._notify_once(
                "Negatif bakiye riski",
                "Önümüzdeki 30/60/90 gün içinde negatif bakiye riski var.",
                level="ERROR",
            )

        return Response(
            {
                "as_of": today,
                "summary": {
                    "overdue_collections": len(overdue_items),
                    "upcoming_cheques": len(cheque_items),
                    "negative_balance_risk": len(negative_balance),
                },
                "overdue_collections": overdue_items,
                "upcoming_cheques": cheque_items,
                "negative_balance_risk": negative_balance,
            }
        )
