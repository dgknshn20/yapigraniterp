from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.finance.models import Cheque


class Command(BaseCommand):
    help = "Vadesi yaklaşan veya geçen çekleri kontrol eder ve uyarı oluşturur."

    def handle(self, *args, **kwargs):
        today = timezone.now().date()
        warning_threshold = today + timedelta(days=3)

        upcoming_cheques = Cheque.objects.filter(
            status="PORTFOLIO",
            due_date__lte=warning_threshold,
            due_date__gte=today,
        )

        if upcoming_cheques.exists():
            self.stdout.write(
                self.style.WARNING(
                    f"--- Vadesi Yaklaşan {upcoming_cheques.count()} Çek Var ---"
                )
            )
            for cheque in upcoming_cheques:
                days_left = (cheque.due_date - today).days
                self.stdout.write(
                    f"- {cheque.serial_number}: {cheque.amount} {cheque.currency} (Vadeye {days_left} gün kaldı)"
                )

        overdue_cheques = Cheque.objects.filter(
            status="PORTFOLIO",
            due_date__lt=today,
        )

        if overdue_cheques.exists():
            self.stdout.write(
                self.style.ERROR(
                    f"--- Vadesi GEÇMİŞ {overdue_cheques.count()} Çek Var! ---"
                )
            )
            for cheque in overdue_cheques:
                self.stdout.write(
                    f"- {cheque.serial_number}: {cheque.amount} {cheque.currency} (Vade: {cheque.due_date})"
                )

        self.stdout.write(self.style.SUCCESS("Çek kontrolü tamamlandı."))
