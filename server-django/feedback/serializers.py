from rest_framework import serializers
from .models import Feedback


class FeedbackCreateSerializer(serializers.Serializer):
    """
    Validates incoming feedback — matches the Node server's Zod schema exactly.
    """
    project_id = serializers.CharField()
    type = serializers.ChoiceField(choices=['feedback', 'bug_report', 'feature_request'])
    timestamp = serializers.DateTimeField(required=False)
    event_id = serializers.CharField(required=False, allow_null=True)
    title = serializers.CharField(min_length=1)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    category = serializers.CharField(required=False, allow_null=True)
    severity = serializers.CharField(required=False, allow_null=True)
    impact = serializers.CharField(required=False, allow_null=True)
    email = serializers.CharField(required=False, allow_null=True)
    context = serializers.JSONField(required=False, default=None)
    metadata = serializers.JSONField(required=False, default=None)
    screenshots = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    highlighted_element = serializers.JSONField(required=False, default=None)
    user_id = serializers.CharField(required=False, allow_null=True)
    tenant_id = serializers.CharField(required=False, allow_null=True)
    role = serializers.CharField(required=False, allow_null=True)
    screen_id = serializers.CharField(required=False, allow_null=True)
    page_name = serializers.CharField(required=False, allow_null=True)
    bernstein_run_id = serializers.CharField(required=False, allow_null=True)


class FeedbackListSerializer(serializers.ModelSerializer):
    """Fields returned in the list endpoint."""

    class Meta:
        model = Feedback
        fields = [
            'id', 'project_id', 'type', 'title', 'description',
            'category', 'severity', 'impact', 'email',
            'screen_id', 'page_name', 'user_id', 'tenant_id',
            'screenshots', 'created_at',
        ]


class FeedbackDetailSerializer(serializers.ModelSerializer):
    """All fields returned in the detail endpoint."""

    class Meta:
        model = Feedback
        fields = '__all__'
