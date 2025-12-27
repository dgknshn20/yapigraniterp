from datetime import date

from django.core.files.storage import default_storage
from django.db.models import Sum
from rest_framework import serializers

from apps.finance.models import Account, Transaction, Cheque, PaymentPlan, PaymentInstallment, FixedExpense


class FilePathMixin:
    """Validates and assigns already-uploaded media file paths (from /api/upload/)."""

    def validate_upload_path(self, value):
        if value in (None, ""):
            return value

        normalized = value
        if normalized.startswith("http://") or normalized.startswith("https://"):
            raise serializers.ValidationError("Path must be relative, not absolute URL")

        if normalized.startswith("/media/"):
            normalized = normalized[len("/media/") :]
        if normalized.startswith("media/"):
            normalized = normalized[len("media/") :]

        if not default_storage.exists(normalized):
            raise serializers.ValidationError(f"Uploaded file not found: {normalized}")

        return normalized

    def save_file_from_path(self, instance, field_name, path_value):
        if path_value is None:
            return

        file_field = getattr(instance, field_name)
        if path_value == "":
            if file_field:
                file_field.delete(save=False)
            setattr(instance, field_name, None)
        else:
            file_field.name = path_value

        instance.save(update_fields=[field_name])

class AccountSerializer(serializers.ModelSerializer):
    current_balance = serializers.SerializerMethodField(read_only=True)

    def get_current_balance(self, obj):
        incoming = Transaction.objects.filter(target_account=obj).aggregate(s=Sum("amount"))["s"] or 0
        outgoing = Transaction.objects.filter(source_account=obj).aggregate(s=Sum("amount"))["s"] or 0
        return (obj.initial_balance or 0) + incoming - outgoing

    class Meta:
        model = Account
        fields = "__all__"

class TransactionSerializer(serializers.ModelSerializer, FilePathMixin):
    source_account_name = serializers.CharField(source="source_account.name", read_only=True)
    target_account_name = serializers.CharField(source="target_account.name", read_only=True)

    # Backward compatibility for existing clients
    transaction_date = serializers.DateField(source="date", required=False)

    document_url = serializers.SerializerMethodField(read_only=True)
    document_path = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def get_document_url(self, obj):
        request = self.context.get("request")
        if not getattr(obj, "document", None):
            return None
        try:
            url = obj.document.url
        except Exception:
            return None
        return request.build_absolute_uri(url) if request else url

    def validate_document_path(self, value):
        return self.validate_upload_path(value)

    class Meta:
        model = Transaction
        fields = [
            "id", "description", "amount", "date", "transaction_type",
            "transaction_date",
            "source_account", "target_account",
            "source_account_name", "target_account_name",
            "related_customer", "related_contract",
            "document",
            "document_url",
            "document_path",
        ]

    def validate(self, data):
        source = data.get("source_account")
        target = data.get("target_account")
        if source and target and source == target:
            raise serializers.ValidationError("Kaynak ve hedef hesap aynı olamaz.")
        return data

    def create(self, validated_data):
        document_path = validated_data.pop("document_path", None)
        instance = super().create(validated_data)
        self.save_file_from_path(instance, "document", document_path)
        return instance

    def update(self, instance, validated_data):
        document_path = validated_data.pop("document_path", None)
        instance = super().update(instance, validated_data)
        self.save_file_from_path(instance, "document", document_path)
        return instance

class ChequeSerializer(serializers.ModelSerializer, FilePathMixin):
    """
    Çek/Senet verilerini işleyen ve doğrulayan sınıf.
    """
    customer_name = serializers.CharField(source='received_from_customer.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    days_to_due = serializers.SerializerMethodField()

    photo_front_url = serializers.SerializerMethodField(read_only=True)
    photo_back_url = serializers.SerializerMethodField(read_only=True)
    photo_front_path = serializers.CharField(write_only=True, required=False, allow_blank=True)
    photo_back_path = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def _file_url(self, file_field):
        request = self.context.get("request")
        if not file_field:
            return None
        try:
            url = file_field.url
        except Exception:
            return None
        return request.build_absolute_uri(url) if request else url

    def get_photo_front_url(self, obj):
        return self._file_url(getattr(obj, "photo_front", None))

    def get_photo_back_url(self, obj):
        return self._file_url(getattr(obj, "photo_back", None))

    def _normalize_media_path(self, value, field_name):
        return self.validate_upload_path(value)

    def validate_photo_front_path(self, value):
        return self._normalize_media_path(value, "photo_front_path")

    def validate_photo_back_path(self, value):
        return self._normalize_media_path(value, "photo_back_path")

    class Meta:
        model = Cheque
        fields = [
            'id', 'serial_number', 'drawer', 'amount', 'currency', 'due_date',
            'status', 'status_display', 'current_location',
            'received_from_customer', 'customer_name',
            'given_to_supplier',
            'photo_front', 'photo_back',
            'photo_front_url', 'photo_back_url',
            'photo_front_path', 'photo_back_path',
            'days_to_due', 'created_at'
        ]
        read_only_fields = ['status', 'created_at']

    def create(self, validated_data):
        front_path = validated_data.pop("photo_front_path", None)
        back_path = validated_data.pop("photo_back_path", None)
        instance = super().create(validated_data)
        self.save_file_from_path(instance, "photo_front", front_path)
        self.save_file_from_path(instance, "photo_back", back_path)
        return instance

    def update(self, instance, validated_data):
        front_path = validated_data.pop("photo_front_path", None)
        back_path = validated_data.pop("photo_back_path", None)
        instance = super().update(instance, validated_data)
        self.save_file_from_path(instance, "photo_front", front_path)
        self.save_file_from_path(instance, "photo_back", back_path)
        return instance

    def get_days_to_due(self, obj):
        """
        Vadeye kaç gün kaldı? (Eksi değer ise günü geçmiş demektir)
        """
        delta = obj.due_date - date.today()
        return delta.days

    def validate_serial_number(self, value):
        """
        Aynı seri numaralı çek daha önce kaydedilmiş mi?
        """
        instance = self.instance
        if Cheque.objects.filter(serial_number=value).exclude(pk=instance.pk if instance else None).exists():
            raise serializers.ValidationError("Bu seri numarasına sahip bir çek zaten sistemde kayıtlı.")
        return value

class ChequeActionSerializer(serializers.Serializer):
    """
    Ciro etme veya Tahsil etme işlemleri için veri doğrulayıcı.
    """
    target_account_id = serializers.IntegerField(
        required=True, 
        help_text="Paranın girdiği Kasa/Banka veya Çekin verildiği Tedarikçi Hesabı ID'si"
    )
    description = serializers.CharField(required=False, allow_blank=True)


class PaymentInstallmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentInstallment
        fields = "__all__"


class PaymentPlanSerializer(serializers.ModelSerializer):
    installments = PaymentInstallmentSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="contract.customer_name", read_only=True)
    project_name = serializers.CharField(source="contract.project_name", read_only=True)

    class Meta:
        model = PaymentPlan
        fields = "__all__"


class FixedExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = FixedExpense
        fields = "__all__"
