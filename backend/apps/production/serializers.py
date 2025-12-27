from django.core.files.storage import default_storage
from rest_framework import serializers

from apps.production.models import Contract


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


class ContractSerializer(serializers.ModelSerializer, FilePathMixin):
    proposal_number = serializers.CharField(source="proposal.proposal_number", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    source_offer_id = serializers.IntegerField(source="proposal_id", read_only=True)
    customer_id = serializers.IntegerField(source="proposal.customer_id", read_only=True)

    contract_file_url = serializers.SerializerMethodField(read_only=True)
    contract_file_path = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def get_contract_file_url(self, obj):
        request = self.context.get("request")
        if not getattr(obj, "contract_file", None):
            return None
        try:
            url = obj.contract_file.url
        except Exception:
            return None
        return request.build_absolute_uri(url) if request else url

    def validate_contract_file_path(self, value):
        return self.validate_upload_path(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        role = getattr(getattr(request, "user", None), "role", None)

        if role == "PRODUCTION":
            for field in (
                "subtotal_amount",
                "tax_amount",
                "discount_amount",
                "total_amount",
                "currency",
                "include_tax",
                "tax_rate",
                "contract_file",
                "contract_file_url",
            ):
                data.pop(field, None)
            snapshot = data.get("items_snapshot")
            if isinstance(snapshot, list):
                cleaned = []
                for item in snapshot:
                    if not isinstance(item, dict):
                        continue
                    cleaned.append(
                        {
                            key: value
                            for key, value in item.items()
                            if key not in {"unit_price", "labor_cost", "total_price", "fire_rate"}
                        }
                    )
                data["items_snapshot"] = cleaned
        return data

    def create(self, validated_data):
        contract_file_path = validated_data.pop("contract_file_path", None)
        instance = super().create(validated_data)
        self.save_file_from_path(instance, "contract_file", contract_file_path)
        return instance

    def update(self, instance, validated_data):
        contract_file_path = validated_data.pop("contract_file_path", None)
        instance = super().update(instance, validated_data)
        self.save_file_from_path(instance, "contract_file", contract_file_path)
        return instance

    class Meta:
        model = Contract
        fields = "__all__"
