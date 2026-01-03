from rest_framework import serializers
from decimal import Decimal
from django.db.models import Sum
from django.utils import timezone

from apps.crm.models import Customer, Proposal, ProposalItem
from apps.finance.models import Transaction, PaymentInstallment, Cheque
from apps.production.models import Contract

class CustomerSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    segment_display = serializers.CharField(source="get_segment_display", read_only=True)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        role = getattr(getattr(request, "user", None), "role", None)

        if role not in {"ADMIN", "SALES"}:
            data.pop("internal_notes", None)
        if role not in {"ADMIN", "FINANCE"}:
            data.pop("risk_limit", None)
        return data

    class Meta:
        model = Customer
        fields = "__all__"
        extra_kwargs = {
            "customer_number": {"read_only": True},
        }

    def validate(self, data):
        phone = data.get("phone")
        tax_number = data.get("tax_number")
        instance = getattr(self, "instance", None)

        if phone:
            qs = Customer.objects.filter(phone=phone)
            if instance:
                qs = qs.exclude(pk=instance.pk)
            existing = qs.first()
            if existing:
                raise serializers.ValidationError(
                    {
                        "phone": (
                            "Bu telefon numarası "
                            f"'{existing.name}' adlı müşteride zaten kayıtlı. "
                            "Lütfen mevcut kaydı kullanın."
                        )
                    }
                )

        if tax_number:
            qs = Customer.objects.filter(tax_number=tax_number)
            if instance:
                qs = qs.exclude(pk=instance.pk)
            existing = qs.first()
            if existing:
                raise serializers.ValidationError(
                    {
                        "tax_number": (
                            "Bu Vergi/TC No "
                            f"'{existing.name}' adlı müşteride zaten kayıtlı."
                        )
                    }
                )

        return data


class CustomerDetailSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    segment_display = serializers.CharField(source="get_segment_display", read_only=True)
    balance = serializers.SerializerMethodField()
    last_transactions = serializers.SerializerMethodField()
    active_proposals = serializers.SerializerMethodField()
    contracts = serializers.SerializerMethodField()
    payment_installments = serializers.SerializerMethodField()
    cheques = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = "__all__"
        extra_kwargs = {
            "customer_number": {"read_only": True},
        }

    def _role(self):
        request = self.context.get("request")
        return getattr(getattr(request, "user", None), "role", None)

    def get_last_transactions(self, obj):
        if self._role() not in {"ADMIN", "FINANCE"}:
            return []
        transactions = (
            Transaction.objects.filter(related_customer=obj)
            .order_by("-date", "-id")[:10]
        )
        return [
            {
                "id": t.id,
                "date": t.date.isoformat() if t.date else None,
                "description": t.description,
                "amount": str(t.amount),
                "transaction_type": t.transaction_type,
                "transaction_type_display": t.get_transaction_type_display(),
            }
            for t in transactions
        ]

    def get_balance(self, obj):
        if self._role() not in {"ADMIN", "FINANCE"}:
            return None
        incoming = (
            Transaction.objects.filter(related_customer=obj, transaction_type="INCOME")
            .aggregate(s=Sum("amount"))
            .get("s")
            or Decimal("0.00")
        )
        outgoing = (
            Transaction.objects.filter(related_customer=obj, transaction_type="EXPENSE")
            .aggregate(s=Sum("amount"))
            .get("s")
            or Decimal("0.00")
        )
        return str((incoming - outgoing).quantize(Decimal("0.01")))

    def get_active_proposals(self, obj):
        proposals = (
            Proposal.objects.filter(customer=obj, status__in=["DRAFT", "SENT", "APPROVED"])
            .order_by("-created_at", "-id")
        )
        return [
            {
                "id": p.id,
                "number": p.proposal_number,
                "date": p.created_at.date().isoformat() if p.created_at else None,
                "total": str(p.total_amount),
                "currency": p.currency,
                "status": p.status,
                "status_display": p.get_status_display(),
            }
            for p in proposals
        ]

    def get_contracts(self, obj):
        contracts = (
            Contract.objects.filter(proposal__customer=obj)
            .select_related("proposal")
            .order_by("-id")
        )
        return [
            {
                "id": c.id,
                "project_name": c.project_name,
                "status": c.status,
                "status_display": c.get_status_display(),
                "start_date": c.start_date.isoformat() if c.start_date else None,
                "deadline_date": c.deadline_date.isoformat() if c.deadline_date else None,
                "is_overdue": c.is_overdue,
                "proposal_number": getattr(c.proposal, "proposal_number", None),
            }
            for c in contracts
        ]

    def get_payment_installments(self, obj):
        if self._role() not in {"ADMIN", "FINANCE"}:
            return []
        today = timezone.localdate()
        installments = (
            PaymentInstallment.objects.filter(plan__contract__proposal__customer=obj)
            .select_related("plan", "plan__contract", "plan__contract__proposal", "paid_transaction")
            .order_by("-due_date", "-id")[:50]
        )
        payload = []
        for inst in installments:
            plan = inst.plan
            contract = getattr(plan, "contract", None)
            proposal = getattr(contract, "proposal", None)
            paid_txn = inst.paid_transaction
            payload.append(
                {
                    "id": inst.id,
                    "contract_id": contract.id if contract else None,
                    "proposal_number": getattr(proposal, "proposal_number", None),
                    "project_name": getattr(contract, "project_name", None),
                    "installment_no": inst.installment_no,
                    "due_date": inst.due_date.isoformat() if inst.due_date else None,
                    "amount": str(inst.amount),
                    "currency": inst.currency,
                    "status": inst.status,
                    "status_display": inst.get_status_display(),
                    "paid_at": inst.paid_at.isoformat() if inst.paid_at else None,
                    "paid_transaction_id": paid_txn.id if paid_txn else None,
                    "paid_transaction_date": paid_txn.date.isoformat() if paid_txn and paid_txn.date else None,
                    "method": plan.method if plan else None,
                    "method_display": plan.get_method_display() if plan else None,
                    "is_overdue": inst.status == "PENDING"
                    and inst.due_date is not None
                    and inst.due_date < today,
                }
            )
        return payload

    def get_cheques(self, obj):
        if self._role() not in {"ADMIN", "FINANCE"}:
            return []
        cheques = (
            Cheque.objects.filter(received_from_customer=obj)
            .order_by("due_date", "id")
        )
        return [
            {
                "id": c.id,
                "serial": c.serial_number,
                "amount": str(c.amount),
                "currency": c.currency,
                "due_date": c.due_date.isoformat() if c.due_date else None,
                "status": c.status,
                "status_display": c.get_status_display(),
            }
            for c in cheques
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        role = self._role()

        if role not in {"ADMIN", "SALES"}:
            data.pop("internal_notes", None)
        if role not in {"ADMIN", "FINANCE"}:
            data.pop("risk_limit", None)
            for key in ("balance", "last_transactions", "payment_installments", "cheques"):
                data.pop(key, None)
        return data

class ProposalItemSerializer(serializers.ModelSerializer):
    total_price = serializers.DecimalField(max_digits=19, decimal_places=2, read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    slab_barcode = serializers.CharField(source="slab.barcode", read_only=True)
    area_m2 = serializers.SerializerMethodField()

    class Meta:
        model = ProposalItem
        fields = [
            "id", "proposal",
            "product", "product_name", "slab", "slab_barcode", "description",
            "stone_type", "size_text", "total_measure", "total_unit",
            "width", "length", "quantity",
            "fire_rate", "unit_price", "labor_cost",
            "total_price", "area_m2"
        ]

    def get_area_m2(self, obj):
        return (obj.width * obj.length * obj.quantity) / Decimal("10000")

class ProposalSerializer(serializers.ModelSerializer):
    items = ProposalItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    # Frontend uyumluluğu: UI'daki "Açıklama" alanı description olarak geliyor.
    # Model tarafında karşılığı notes.
    description = serializers.CharField(write_only=True, required=False, allow_blank=True)
    subtotal_amount = serializers.DecimalField(max_digits=19, decimal_places=2, read_only=True)
    tax_amount = serializers.DecimalField(max_digits=19, decimal_places=2, read_only=True)
    grand_total = serializers.DecimalField(max_digits=19, decimal_places=2, read_only=True)

    class Meta:
        model = Proposal
        fields = "__all__"
        extra_kwargs = {
            "proposal_number": {"read_only": True},
            "proposal_no": {"read_only": True},
            "total_amount": {"read_only": True},
        }

    def _handle_description(self, validated_data):
        """Map frontend 'description' field to model 'notes' on both create/update."""
        description = validated_data.pop("description", None)
        if description is not None:
            validated_data["notes"] = description
        return validated_data

    def create(self, validated_data):
        validated_data = self._handle_description(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data = self._handle_description(validated_data)
        return super().update(instance, validated_data)
