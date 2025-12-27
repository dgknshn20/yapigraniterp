import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.core.models import Notification
pytestmark = pytest.mark.django_db


def test_proposal_finalize_permissions(users, make_proposal):
    proposal = make_proposal(owner=users["SALES"])

    for role, user in users.items():
        client = APIClient()
        client.force_authenticate(user=user)

        finalize_resp = client.post(f"/api/proposals/{proposal.id}/finalize/", {}, format="json")
        expected_finalize = 200 if role in {"ADMIN", "SALES"} else 403
        assert finalize_resp.status_code == expected_finalize


def test_finance_actions_permissions(users, make_transaction, make_cheque, make_account,
                                     make_payment_plan):
    make_transaction()

    for role, user in users.items():
        client = APIClient()
        client.force_authenticate(user=user)
        allowed = role in {"ADMIN", "FINANCE"}

        resp = client.get("/api/transactions/daily_summary/")
        assert resp.status_code == (200 if allowed else 403)

        resp = client.get("/api/transactions/export_excel/")
        assert resp.status_code == (200 if allowed else 403)

        cheque = make_cheque()
        account = make_account()
        resp = client.post(f"/api/cheques/{cheque.id}/endorse/", {"target_account_id": account.id}, format="json")
        assert resp.status_code == (200 if allowed else 403)

        cheque.refresh_from_db()
        if cheque.status != "PORTFOLIO":
            cheque.status = "PORTFOLIO"
            cheque.save(update_fields=["status"])

        resp = client.post(f"/api/cheques/{cheque.id}/collect/", {"target_account_id": account.id}, format="json")
        assert resp.status_code == (200 if allowed else 403)

        plan = make_payment_plan()
        plan.build_installments()
        installment = plan.installments.first()
        resp = client.post(f"/api/payment-plans/{plan.id}/rebuild/", {}, format="json")
        assert resp.status_code == (200 if allowed else 403)

        resp = client.post(
            f"/api/payment-plans/{plan.id}/pay-installment/",
            {
                "installment_id": installment.id,
                "target_account_id": account.id,
                "description": "Pay",
            },
            format="json",
        )
        assert resp.status_code == (200 if allowed else 403)


def test_finance_insights_permissions(users):
    for role, user in users.items():
        client = APIClient()
        client.force_authenticate(user=user)

        cashflow = client.get("/api/finance/cashflow-forecast/")
        alerts = client.get("/api/finance/alerts/")
        expected = 200 if role in {"ADMIN", "FINANCE"} else 403
        assert cashflow.status_code == expected
        assert alerts.status_code == expected

        profitability = client.get("/api/finance/project-profitability/")
        expected_profit = 200 if role == "ADMIN" else 403
        assert profitability.status_code == expected_profit


def test_notification_actions_permissions(users):
    for role, user in users.items():
        Notification.objects.create(recipient=user, title="N1", message="Test")
        client = APIClient()
        client.force_authenticate(user=user)

        resp = client.get("/api/notifications/unread/")
        assert resp.status_code == 200

        notif = Notification.objects.filter(recipient=user).first()
        resp = client.post(f"/api/notifications/{notif.id}/mark-read/", {}, format="json")
        assert resp.status_code == 200

        resp = client.post("/api/notifications/mark-all-read/", {}, format="json")
        assert resp.status_code == 200


def test_upload_and_me_permissions(users, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path

    for role, user in users.items():
        client = APIClient()
        client.force_authenticate(user=user)

        resp = client.get("/api/auth/me/")
        assert resp.status_code == 200

        upload = SimpleUploadedFile("test.txt", b"hello", content_type="text/plain")
        resp = client.post("/api/upload/", {"file": upload})
        assert resp.status_code == 201

    anon = APIClient()
    resp = anon.get("/api/auth/me/")
    assert resp.status_code == 401
