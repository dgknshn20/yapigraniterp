from rest_framework import serializers

from apps.core.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]
