from django.core.files.storage import default_storage
from rest_framework import serializers

from apps.inventory.models import ProductDefinition, Slab


class ProductDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductDefinition
        fields = "__all__"


class SlabSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    reserved_for_project = serializers.CharField(source="reserved_for.project_name", read_only=True)
    area_m2 = serializers.DecimalField(max_digits=19, decimal_places=4, read_only=True)
    photo_url = serializers.SerializerMethodField(read_only=True)

    # Allow setting ImageField using an already-uploaded path (from /api/upload/)
    photo_path = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def get_photo_url(self, obj):
        request = self.context.get("request")
        if not getattr(obj, "photo", None):
            return None
        try:
            url = obj.photo.url
        except Exception:
            return None
        return request.build_absolute_uri(url) if request else url

    def validate_photo_path(self, value):
        if value in (None, ""):
            return value

        # Expect something like '/media/uploads/xxx.png' (from default_storage.url)
        normalized = value
        if normalized.startswith("http://") or normalized.startswith("https://"):
            raise serializers.ValidationError("photo_path must be a relative media URL/path, not an absolute URL")

        if normalized.startswith("/media/"):
            normalized = normalized[len("/media/") :]
        if normalized.startswith("media/"):
            normalized = normalized[len("media/") :]

        if not default_storage.exists(normalized):
            raise serializers.ValidationError("Uploaded file not found for photo_path")

        return normalized

    def create(self, validated_data):
        photo_path = validated_data.pop("photo_path", None)
        instance = super().create(validated_data)
        if photo_path:
            instance.photo.name = photo_path
            instance.save(update_fields=["photo"])
        return instance

    def update(self, instance, validated_data):
        photo_path = validated_data.pop("photo_path", None)
        instance = super().update(instance, validated_data)
        if photo_path is not None:
            if photo_path == "":
                if instance.photo:
                    instance.photo.delete(save=False)
                instance.photo = None
                instance.save(update_fields=["photo"])
            else:
                instance.photo.name = photo_path
                instance.save(update_fields=["photo"])
        return instance

    class Meta:
        model = Slab
        fields = "__all__"
