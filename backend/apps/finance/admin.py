from django.contrib import admin
from .models import Account, Transaction, Cheque, FixedExpense, PaymentPlan, PaymentInstallment, PaymentReminder

admin.site.register(Account)
admin.site.register(Transaction)
admin.site.register(Cheque)
admin.site.register(FixedExpense)
admin.site.register(PaymentPlan)
admin.site.register(PaymentInstallment)
admin.site.register(PaymentReminder)
