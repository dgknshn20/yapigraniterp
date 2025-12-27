from django.contrib import admin
from .models import Customer, Proposal, ProposalItem, Appointment, OfferApprovalFlow, OfferAuditLog


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("name", "customer_type", "status", "segment", "owner")
    list_filter = ("customer_type", "status", "segment")
    search_fields = ("name", "phone", "tax_number")


admin.site.register(Proposal)
admin.site.register(ProposalItem)
admin.site.register(Appointment)
admin.site.register(OfferApprovalFlow)
admin.site.register(OfferAuditLog)
