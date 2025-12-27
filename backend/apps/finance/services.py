from django.utils import timezone

from apps.core.models import Notification
from apps.finance.models import Transaction


def record_installment_payment(*, installment, target_account, description=""):
    contract = getattr(installment.plan, "contract", None)
    customer = getattr(getattr(contract, "proposal", None), "customer", None)
    customer_name = getattr(contract, "customer_name", None) or (customer.name if customer else None)

    txn = Transaction.objects.create(
        description=(
            f"Taksit Tahsilatı: Sözleşme#{getattr(contract, 'id', '-')}"
            f" Taksit#{installment.installment_no} - {description}".strip()
        ),
        amount=installment.amount,
        date=timezone.localdate(),
        transaction_type="INCOME",
        source_account=None,
        target_account=target_account,
        related_customer=customer,
        related_contract=contract,
    )

    installment.status = "PAID"
    installment.paid_at = timezone.localdate()
    installment.paid_transaction = txn
    installment.save(update_fields=["status", "paid_at", "paid_transaction"])

    message = (
        f"{customer_name or 'Müşteri'} • "
        f"{installment.amount} {installment.currency} tahsil edildi."
    )

    for role in ("FINANCE", "ADMIN"):
        Notification.objects.create(
            recipient_role=role,
            title="Taksit tahsil edildi",
            message=message,
            level="SUCCESS",
            related_url="/finance",
        )

    return txn
