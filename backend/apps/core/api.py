from django.db import models
from django.db.models import Sum
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import viewsets
from rest_framework.decorators import action

from apps.crm.models import Proposal
from apps.finance.models import Account, Transaction
from apps.core.models import Notification
from apps.core.serializers import NotificationSerializer
from apps.core.permissions import is_admin


class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = getattr(request.user, "role", None)
        today = timezone.localdate()
        start_of_month = today.replace(day=1)

        monthly_income = 0
        monthly_expense = 0
        total_cash = 0
        if role in {"ADMIN", "FINANCE"} or is_admin(request.user):
            monthly_income = (
                Transaction.objects.filter(transaction_type="INCOME", date__gte=start_of_month)
                .aggregate(s=Sum("amount"))
                .get("s")
                or 0
            )

            monthly_expense = (
                Transaction.objects.filter(transaction_type="EXPENSE", date__gte=start_of_month)
                .aggregate(s=Sum("amount"))
                .get("s")
                or 0
            )

            cash_accounts = Account.objects.filter(account_type__in=["CASH", "BANK"], currency="TRY")
            cash_account_ids = list(cash_accounts.values_list("id", flat=True))
            cash_initial = cash_accounts.aggregate(s=Sum("initial_balance")).get("s") or 0
            cash_incoming = (
                Transaction.objects.filter(target_account_id__in=cash_account_ids)
                .aggregate(s=Sum("amount"))
                .get("s")
                or 0
            )
            cash_outgoing = (
                Transaction.objects.filter(source_account_id__in=cash_account_ids)
                .aggregate(s=Sum("amount"))
                .get("s")
                or 0
            )
            total_cash = cash_initial + cash_incoming - cash_outgoing

        pending_proposals = Proposal.objects.filter(status="DRAFT").count()
        approved_proposals = Proposal.objects.filter(status="APPROVED").count()

        recent_transactions = []
        if role in {"ADMIN", "FINANCE"} or is_admin(request.user):
            recent_transactions = (
                Transaction.objects.select_related("source_account", "target_account")
                .order_by("-created_at")[:5]
                .values("date", "description", "amount", "transaction_type")
            )

        payload = {
            "finance": {
                "monthly_income": monthly_income,
                "monthly_expense": monthly_expense,
                "total_cash": total_cash,
                "currency": "TRY",
            },
            "sales": {
                "pending_proposals": pending_proposals,
                "approved_proposals": approved_proposals,
            },
            "recent_activity": list(recent_transactions),
        }

        if role == "PRODUCTION":
            payload["finance"] = None
            payload["sales"] = None
            payload["recent_activity"] = []
        elif role == "SALES":
            payload["finance"] = None
            payload["recent_activity"] = []
        elif role == "FINANCE":
            payload["sales"] = None

        return Response(payload)


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Notification.objects.all()
        return qs.filter(
            models.Q(recipient=user)
            | models.Q(recipient__isnull=True, recipient_role=user.role)
        ).order_by("-created_at", "-id")

    @action(detail=False, methods=["get"], url_path="unread")
    def unread(self, request):
        qs = self.get_queryset().filter(is_read=False)[:50]
        return Response(NotificationSerializer(qs, many=True, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.mark_read()
        return Response(NotificationSerializer(notif, context={"request": request}).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        qs = self.get_queryset().filter(is_read=False)
        qs.update(is_read=True, read_at=timezone.now())
        return Response({"status": "ok"})


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "role": user.role,
                "is_superuser": user.is_superuser,
            }
        )
