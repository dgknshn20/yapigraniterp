from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from decimal import Decimal
import json
from datetime import date, timedelta
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.crm.models import (
    Customer,
    Proposal,
    ProposalItem,
    Appointment,
    OfferApprovalFlow,
    OfferAuditLog,
)
from apps.crm.serializers import (
    CustomerSerializer, CustomerDetailSerializer, ProposalSerializer, ProposalItemSerializer
)
from apps.production.models import Contract, WorkOrder
from apps.production.services import next_contract_no
from apps.finance.models import PaymentPlan
from apps.inventory.models import Slab, StockReservation
from apps.core.models import Notification, Task, SystemEvent
from apps.core.permissions import RolePermission, is_admin

SOFT_RESERVATION_DAYS = 7


def _audit_log(*, proposal, actor, action, message="", metadata=None):
    log, _ = OfferAuditLog.objects.get_or_create(
        proposal=proposal,
        action=action,
        defaults={
            "actor": actor,
            "message": message,
            "metadata": metadata or {},
        },
    )
    if log.actor_id != getattr(actor, "id", None) or message or metadata:
        log.actor = actor
        if message:
            log.message = message
        if metadata:
            log.metadata = metadata
        log.save(update_fields=["actor", "message", "metadata", "updated_at"])


def _notify_once(*, title, message, recipient=None, recipient_role="", related_url=""):
    since = timezone.now() - timedelta(hours=24)
    qs = Notification.objects.filter(title=title, message=message, created_at__gte=since)
    if recipient:
        qs = qs.filter(recipient=recipient)
    if recipient_role:
        qs = qs.filter(recipient_role=recipient_role)
    if qs.exists():
        return
    Notification.objects.create(
        recipient=recipient,
        recipient_role=recipient_role,
        title=title,
        message=message,
        level="INFO",
        related_url=related_url,
    )


def _emit_event_once(event_type, payload):
    qs = SystemEvent.objects.filter(event_type=event_type)
    offer_id = payload.get("offer_id")
    metric = payload.get("metric")
    if offer_id is not None:
        qs = qs.filter(payload__offer_id=offer_id)
    if metric is not None:
        qs = qs.filter(payload__metric=metric)
    if qs.exists():
        return
    SystemEvent.objects.create(event_type=event_type, payload=payload)


def _snapshot_items(proposal):
    items = proposal.items.select_related("product", "slab").all()
    payload = []
    for item in items:
        area_m2 = (item.width * item.length * Decimal(item.quantity)) / Decimal("10000")
        payload.append(
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": getattr(item.product, "name", ""),
                "slab_id": item.slab_id,
                "slab_barcode": getattr(item.slab, "barcode", ""),
                "description": item.description,
                "stone_type": item.stone_type,
                "size_text": item.size_text,
                "total_measure": str(item.total_measure) if item.total_measure is not None else None,
                "total_unit": item.total_unit,
                "width": str(item.width),
                "length": str(item.length),
                "quantity": item.quantity,
                "unit_price": str(item.unit_price),
                "fire_rate": str(item.fire_rate),
                "labor_cost": str(item.labor_cost),
                "total_price": str(item.total_price),
                "area_m2": str(area_m2),
            }
        )
    return payload


def _ensure_contract(*, proposal, actor):
    customer = proposal.customer
    items_snapshot = _snapshot_items(proposal)
    subtotal = proposal.subtotal_amount
    tax_amount = proposal.tax_amount
    total = proposal.grand_total

    contract = Contract.objects.filter(proposal=proposal).select_for_update().first()
    created = False
    if not contract:
        contract = Contract.objects.create(
            proposal=proposal,
            contract_no=next_contract_no(),
            project_name=f"{customer.name} - {proposal.proposal_number}",
            job_address=customer.address or "",
            start_date=timezone.localdate(),
            deadline_date=proposal.valid_until,
            status="IMZA_BEKLIYOR",
            items_snapshot=items_snapshot,
            customer_name=customer.name,
            customer_address=customer.address or "",
            customer_phone=customer.phone or "",
            customer_email=customer.email or "",
            customer_tax_number=customer.tax_number or "",
            customer_tax_office=customer.tax_office or "",
            subtotal_amount=subtotal,
            tax_amount=tax_amount,
            total_amount=total,
            discount_amount=Decimal("0.00"),
            currency=proposal.currency,
            include_tax=proposal.include_tax,
            tax_rate=proposal.tax_rate,
            valid_until=proposal.valid_until,
            notes=proposal.notes or "",
            is_active=True,
        )
        created = True
    else:
        updates = {}
        if not contract.contract_no:
            updates["contract_no"] = next_contract_no()
        if contract.status == "IMZA_BEKLIYOR":
            updates.update(
                {
                    "project_name": contract.project_name or f"{customer.name} - {proposal.proposal_number}",
                    "job_address": contract.job_address or (customer.address or ""),
                    "items_snapshot": items_snapshot,
                    "customer_name": customer.name,
                    "customer_address": customer.address or "",
                    "customer_phone": customer.phone or "",
                    "customer_email": customer.email or "",
                    "customer_tax_number": customer.tax_number or "",
                    "customer_tax_office": customer.tax_office or "",
                    "subtotal_amount": subtotal,
                    "tax_amount": tax_amount,
                    "total_amount": total,
                    "currency": proposal.currency,
                    "include_tax": proposal.include_tax,
                    "tax_rate": proposal.tax_rate,
                    "valid_until": proposal.valid_until,
                    "deadline_date": proposal.valid_until,
                    "notes": proposal.notes or "",
                }
            )
        if updates:
            for key, value in updates.items():
                setattr(contract, key, value)
            contract.save(update_fields=list(updates.keys()))
    return contract, created


def _parse_schedule(payment_method, total_amount, currency, first_due_date, raw_installments, installment_count):
    schedule = []
    method_map = {
        "CASH": "CASH",
        "INSTALLMENT": "TRANSFER",
        "CHEQUE": "CHEQUE",
        "MIXED": "CASH",
    }

    if raw_installments:
        for idx, item in enumerate(raw_installments, start=1):
            try:
                due_date = date.fromisoformat(item.get("due_date"))
            except Exception:
                due_date = first_due_date
            try:
                installment_no = int(item.get("installment_no") or idx)
            except (TypeError, ValueError):
                installment_no = idx
            schedule.append(
                {
                    "installment_no": installment_no,
                    "due_date": due_date,
                    "amount": Decimal(item.get("amount") or 0),
                    "method": (item.get("method") or method_map.get(payment_method, "CASH")).upper(),
                }
            )
        return schedule

    if payment_method == "INSTALLMENT":
        count = int(installment_count or 4)
        base = (Decimal(total_amount) / Decimal(count)).quantize(Decimal("0.01"))
        amounts = [base for _ in range(count)]
        diff = Decimal(total_amount) - sum(amounts)
        amounts[-1] = (amounts[-1] + diff).quantize(Decimal("0.01"))
        for i in range(count):
            schedule.append(
                {
                    "installment_no": i + 1,
                    "due_date": PaymentPlan.add_months(first_due_date, i),
                    "amount": amounts[i],
                    "method": method_map.get(payment_method, "TRANSFER"),
                }
            )
        return schedule

    schedule.append(
        {
            "installment_no": 1,
            "due_date": first_due_date,
            "amount": Decimal(total_amount),
            "method": method_map.get(payment_method, "CASH"),
        }
    )
    return schedule


def _ensure_payment_plan(*, contract, proposal, payload):
    payment_method = (payload.get("payment_method") or "CASH").upper()
    raw_installments = payload.get("installments") or []
    if isinstance(raw_installments, str):
        try:
            raw_installments = json.loads(raw_installments)
        except Exception:
            raw_installments = []
    if not isinstance(raw_installments, list):
        raw_installments = []
    installment_count = int(payload.get("installment_count") or 4)
    first_due_date = proposal.valid_until or timezone.localdate()
    first_due_raw = payload.get("first_due_date")
    if first_due_raw:
        try:
            first_due_date = date.fromisoformat(first_due_raw)
        except ValueError:
            pass

    total_amount = Decimal(contract.total_amount or proposal.grand_total or 0)
    if raw_installments:
        payment_method = "MIXED"
        installment_count = len(raw_installments) or 1
    elif payment_method != "INSTALLMENT":
        installment_count = 1

    plan_defaults = {
        "method": payment_method,
        "currency": proposal.currency,
        "total_amount": total_amount,
        "installment_count": installment_count,
        "first_due_date": first_due_date,
        "is_active": True,
    }

    plan, created = PaymentPlan.objects.get_or_create(contract=contract, defaults=plan_defaults)
    if not created:
        updates = {}
        for key, value in plan_defaults.items():
            if getattr(plan, key) != value:
                updates[key] = value
        if updates:
            for key, value in updates.items():
                setattr(plan, key, value)
            plan.save(update_fields=list(updates.keys()))

    schedule = _parse_schedule(
        payment_method,
        total_amount,
        proposal.currency,
        first_due_date,
        raw_installments,
        installment_count,
    )
    plan.build_installments(schedule=schedule)
    return plan


def _ensure_reservations(*, contract, proposal):
    now = timezone.now()
    expires_at = now + timedelta(days=SOFT_RESERVATION_DAYS)
    reservations = []

    for item in proposal.items.select_related("product", "slab").all():
        if not item.product:
            continue
        slab = None
        if item.slab_id:
            slab = Slab.objects.select_for_update().get(id=item.slab_id)
            if slab.reserved_for_id and slab.reserved_for_id != contract.id:
                raise serializers.ValidationError(
                    {"slab": f"Plaka {slab.barcode} başka bir sözleşmeye rezerve edilmiş."}
                )
            if slab.status in {"USED", "SOLD"}:
                raise serializers.ValidationError(
                    {"slab": f"Plaka {slab.barcode} kullanılmış/satılmış durumda."}
                )
            if slab.status == "RESERVED" and slab.reserved_for_id != contract.id:
                raise serializers.ValidationError(
                    {"slab": f"Plaka {slab.barcode} başka bir sözleşmede kilitli."}
                )
            if slab.soft_reserved_for_id and slab.soft_reserved_for_id != contract.id:
                if slab.soft_reserved_until and slab.soft_reserved_until >= now:
                    raise serializers.ValidationError(
                        {"slab": f"Plaka {slab.barcode} başka bir teklif için soft rezerve."}
                    )
                slab.soft_reserved_for = None
                slab.soft_reserved_until = None
                slab.save(update_fields=["soft_reserved_for", "soft_reserved_until"])
        area_m2 = (item.width * item.length * Decimal(item.quantity)) / Decimal("10000")
        thickness = slab.thickness if slab else None
        reservation, _ = StockReservation.objects.get_or_create(
            contract=contract,
            proposal_item=item,
            defaults={
                "product": item.product,
                "slab": slab,
                "area_m2": area_m2,
                "thickness_mm": thickness,
                "status": "SOFT_RESERVED",
                "expires_at": expires_at,
            },
        )
        updates = {}
        if reservation.product_id != item.product_id:
            updates["product"] = item.product
        if reservation.slab_id != (slab.id if slab else None):
            updates["slab"] = slab
        if reservation.area_m2 != area_m2:
            updates["area_m2"] = area_m2
        if thickness and reservation.thickness_mm != thickness:
            updates["thickness_mm"] = thickness
        if reservation.status == "SOFT_RESERVED" and reservation.expires_at != expires_at:
            updates["expires_at"] = expires_at
        if updates:
            for key, value in updates.items():
                setattr(reservation, key, value)
            reservation.save(update_fields=list(updates.keys()))

        if slab:
            if slab.soft_reserved_for_id != contract.id or slab.soft_reserved_until != expires_at:
                slab.soft_reserved_for = contract
                slab.soft_reserved_until = expires_at
                slab.save(update_fields=["soft_reserved_for", "soft_reserved_until"])

        reservations.append(reservation)
    return reservations


def _ensure_appointments(*, proposal, actor, approved_at):
    due_date = (approved_at + timedelta(days=2)).date()
    title = "Sözleşme imzası"
    notes = f"Teklif {proposal.proposal_number} onaylandı. İmza randevusu planla."

    appointment, created = Appointment.objects.get_or_create(
        customer=proposal.customer,
        source_type="PROPOSAL",
        source_id=proposal.id,
        defaults={
            "date": due_date,
            "title": title,
            "notes": notes,
        },
    )
    if not created:
        updates = {}
        if appointment.date != due_date:
            updates["date"] = due_date
        if not appointment.title:
            updates["title"] = title
        if not appointment.notes:
            updates["notes"] = notes
        if updates:
            for key, value in updates.items():
                setattr(appointment, key, value)
            appointment.save(update_fields=list(updates.keys()))
    return [appointment]


def _ensure_work_orders(*, contract, proposal):
    work_orders = []
    items = list(proposal.items.select_related("product", "slab").all())

    if not items:
        existing = list(WorkOrder.objects.filter(contract=contract))
        if existing:
            return existing
        work_orders.append(
            WorkOrder.objects.create(
                contract=contract,
                title=f"{contract.project_name or 'Üretim'} (Sözleşme {contract.id})",
                description=f"Sözleşme {contract.contract_no or contract.id} için üretim emri.",
                kind="PRODUCTION",
                target_date=contract.deadline_date,
            )
        )
        return work_orders

    for item in items:
        base = item.description or getattr(item.product, "name", "") or f"Kalem {item.id}"
        title = f"{base} • #{item.id}"
        defaults = {
            "description": f"Teklif {proposal.proposal_number} kalemi #{item.id} için üretim emri.",
            "priority": 1,
            "stage": "PLANLANACAK",
            "kind": "PRODUCTION",
            "slab": item.slab,
            "target_date": contract.deadline_date,
        }
        work_order, created = WorkOrder.objects.get_or_create(
            contract=contract,
            title=title,
            defaults=defaults,
        )
        if not created:
            updates = {}
            if item.slab_id and work_order.slab_id != item.slab_id:
                updates["slab"] = item.slab
            if not work_order.description:
                updates["description"] = defaults["description"]
            if work_order.target_date is None and contract.deadline_date:
                updates["target_date"] = contract.deadline_date
            if updates:
                for key, value in updates.items():
                    setattr(work_order, key, value)
                work_order.save(update_fields=list(updates.keys()))
        work_orders.append(work_order)
    return work_orders

class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by("name")
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN", "SALES", "FINANCE"}
    write_roles = {"ADMIN", "SALES"}

    def get_queryset(self):
        qs = Customer.objects.all().order_by("name")
        user = self.request.user
        if not is_admin(user) and getattr(user, "role", None) == "SALES":
            qs = qs.filter(owner=user)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if not is_admin(user) and getattr(user, "role", None) == "SALES":
            serializer.save(owner=user)
        else:
            serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        if not is_admin(user) and getattr(user, "role", None) == "SALES":
            serializer.save(owner=serializer.instance.owner)
        else:
            serializer.save()

    def get_serializer_class(self):
        if self.action in {"retrieve", "detail"}:
            return CustomerDetailSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["get"], url_path="detail")
    def detail(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)

class ProposalViewSet(viewsets.ModelViewSet):
    queryset = Proposal.objects.select_related("customer").all().order_by("-id")
    serializer_class = ProposalSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN", "SALES"}
    write_roles = {"ADMIN", "SALES"}

    def get_queryset(self):
        qs = Proposal.objects.select_related("customer").all().order_by("-id")
        user = self.request.user
        if not is_admin(user) and getattr(user, "role", None) == "SALES":
            qs = qs.filter(customer__owner=user)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        customer = serializer.validated_data.get("customer")
        if not is_admin(user) and getattr(user, "role", None) == "SALES":
            if customer.owner_id and customer.owner_id != user.id:
                raise PermissionDenied("Bu müşteri size atanmadı.")
            if not customer.owner_id:
                customer.owner = user
                customer.save(update_fields=["owner"])
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        customer = serializer.validated_data.get("customer", serializer.instance.customer)
        if not is_admin(user) and getattr(user, "role", None) == "SALES":
            if customer.owner_id and customer.owner_id != user.id:
                raise PermissionDenied("Bu müşteri size atanmadı.")
        serializer.save()

    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        with transaction.atomic():
            proposal = self.get_queryset().select_for_update().get(id=pk)
            if proposal.status not in {"DRAFT", "APPROVED"}:
                return Response(
                    {"error": "Sadece taslak veya onaylı teklifler işlenebilir."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if proposal.status != "APPROVED":
                proposal.status = "APPROVED"
                proposal.save(update_fields=["status"])

            actor = request.user if request.user.is_authenticated else None
            approved_at = timezone.now()

            contract, contract_created = _ensure_contract(proposal=proposal, actor=actor)

            try:
                plan = _ensure_payment_plan(contract=contract, proposal=proposal, payload=request.data)
                reservations = _ensure_reservations(contract=contract, proposal=proposal)
                work_orders = _ensure_work_orders(contract=contract, proposal=proposal)
                appointments = _ensure_appointments(proposal=proposal, actor=actor, approved_at=approved_at)
            except Exception:
                raise

            message = f"{proposal.customer.name} • {contract.contract_no or proposal.proposal_number}"
            _notify_once(
                title="Sözleşme oluşturuldu, imza bekliyor",
                message=message,
                recipient=actor if actor and actor.is_authenticated else None,
                related_url="/contracts",
            )
            for role in ("ADMIN", "SALES"):
                _notify_once(
                    title="Sözleşme oluşturuldu, imza bekliyor",
                    message=message,
                    recipient_role=role,
                    related_url="/contracts",
                )

            task, created_task = Task.objects.get_or_create(
                source_type="PROPOSAL",
                source_id=proposal.id,
                title="Sözleşme imzasını al",
                defaults={
                    "description": message,
                    "due_date": (approved_at + timedelta(days=2)).date(),
                    "priority": 3,
                    "assigned_to": actor if actor and actor.is_authenticated else None,
                    "assigned_role": "SALES",
                    "related_url": "/contracts",
                },
            )
            if not created_task and task.status == "OPEN":
                updates = {}
                due_date = (approved_at + timedelta(days=2)).date()
                if task.due_date != due_date:
                    updates["due_date"] = due_date
                if task.assigned_to_id != getattr(actor, "id", None):
                    updates["assigned_to"] = actor if actor and actor.is_authenticated else None
                if task.assigned_role != "SALES":
                    updates["assigned_role"] = "SALES"
                if task.priority != 3:
                    updates["priority"] = 3
                if task.description != message:
                    updates["description"] = message
                if updates:
                    for key, value in updates.items():
                        setattr(task, key, value)
                    task.save(update_fields=list(updates.keys()))

            _audit_log(
                proposal=proposal,
                actor=actor,
                action="CONTRACT_CREATED",
                message=f"Sözleşme {'oluşturuldu' if contract_created else 'güncellendi'}",
                metadata={"contract_id": contract.id, "contract_no": contract.contract_no},
            )
            _audit_log(
                proposal=proposal,
                actor=actor,
                action="PAYMENT_PLAN",
                message="Ödeme planı oluşturuldu/güncellendi",
                metadata={"payment_plan_id": plan.id, "installment_count": plan.installment_count},
            )
            _audit_log(
                proposal=proposal,
                actor=actor,
                action="RESERVATIONS",
                message="Stok soft rezervasyonları oluşturuldu",
                metadata={"reservation_ids": [r.id for r in reservations]},
            )
            _audit_log(
                proposal=proposal,
                actor=actor,
                action="WORK_ORDERS",
                message="Üretim iş emirleri oluşturuldu",
                metadata={"work_order_ids": [wo.id for wo in work_orders]},
            )
            _audit_log(
                proposal=proposal,
                actor=actor,
                action="APPOINTMENT",
                message="İmza randevusu oluşturuldu",
                metadata={"appointment_ids": [a.id for a in appointments]},
            )
            _audit_log(
                proposal=proposal,
                actor=actor,
                action="TASK",
                message="İmza görevi oluşturuldu",
                metadata={"task_id": task.id},
            )

            flow, _ = OfferApprovalFlow.objects.get_or_create(proposal=proposal)
            flow.approved_by = actor
            flow.approved_at = approved_at
            flow.contract_id = contract.id
            flow.payment_plan_id = plan.id
            flow.reservation_ids = [r.id for r in reservations]
            flow.save(update_fields=[
                "approved_by",
                "approved_at",
                "contract_id",
                "payment_plan_id",
                "reservation_ids",
                "updated_at",
            ])

            _audit_log(
                proposal=proposal,
                actor=actor,
                action="APPROVAL_FLOW",
                message="Onay akışı kaydı güncellendi",
                metadata={"flow_id": flow.id},
            )

            _emit_event_once(
                "DASHBOARD_DELTA",
                {"offer_id": proposal.id, "metric": "contracts_sign_pending", "delta": 1},
            )
            _emit_event_once(
                "DASHBOARD_DELTA",
                {"offer_id": proposal.id, "metric": "pending_payment_plans", "delta": plan.installment_count},
            )

        return Response(ProposalSerializer(proposal, context={"request": request}).data)

class ProposalItemViewSet(viewsets.ModelViewSet):
    queryset = ProposalItem.objects.select_related("proposal", "proposal__customer").all().order_by("-id")
    serializer_class = ProposalItemSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    read_roles = {"ADMIN", "SALES"}
    write_roles = {"ADMIN", "SALES"}

    def get_queryset(self):
        qs = ProposalItem.objects.select_related("proposal", "proposal__customer").all().order_by("-id")
        user = self.request.user
        if not is_admin(user) and getattr(user, "role", None) == "SALES":
            qs = qs.filter(proposal__customer__owner=user)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        proposal = serializer.validated_data.get("proposal")
        if not is_admin(user) and getattr(user, "role", None) == "SALES":
            if proposal.customer.owner_id and proposal.customer.owner_id != user.id:
                raise PermissionDenied("Bu müşteriye teklif kalemi ekleyemezsiniz.")
        item = serializer.save()
        self._update_proposal_totals(item.proposal)

    def perform_update(self, serializer):
        user = self.request.user
        proposal = serializer.validated_data.get("proposal", serializer.instance.proposal)
        if not is_admin(user) and getattr(user, "role", None) == "SALES":
            if proposal.customer.owner_id and proposal.customer.owner_id != user.id:
                raise PermissionDenied("Bu müşteriye teklif kalemi ekleyemezsiniz.")
        item = serializer.save()
        self._update_proposal_totals(item.proposal)

    def perform_destroy(self, instance):
        proposal = instance.proposal
        instance.delete()
        self._update_proposal_totals(proposal)

    def _update_proposal_totals(self, proposal):
        total = proposal.items.aggregate(s=Sum("total_price"))["s"] or Decimal("0.00")
        proposal.total_amount = total.quantize(Decimal("0.01"))
        proposal.save(update_fields=["total_amount"])
