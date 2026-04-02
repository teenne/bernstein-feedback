import uuid
from django.db import models


class Feedback(models.Model):
    """
    Mirrors the Node server's PostgreSQL feedback table exactly.
    Same column names, same types, same constraints.
    """

    TYPE_CHOICES = [
        ('feedback', 'Feedback'),
        ('bug_report', 'Bug Report'),
        ('feature_request', 'Feature Request'),
    ]

    IMPACT_CHOICES = [
        ('blocks_me', 'Blocks Me'),
        ('annoying', 'Annoying'),
        ('minor', 'Minor'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project_id = models.TextField()

    # Event metadata
    type = models.TextField(choices=TYPE_CHOICES)
    timestamp = models.DateTimeField()
    event_id = models.UUIDField(null=True, blank=True)

    # User input
    title = models.TextField()
    description = models.TextField(null=True, blank=True)
    category = models.TextField(null=True, blank=True)
    severity = models.TextField(null=True, blank=True)
    impact = models.TextField(choices=IMPACT_CHOICES, null=True, blank=True)
    email = models.TextField(null=True, blank=True)

    # Context (JSONB)
    context = models.JSONField(null=True, blank=True)
    metadata = models.JSONField(null=True, blank=True)

    # Assets
    screenshots = models.JSONField(default=list)  # array of base64 or URLs
    highlighted_element = models.JSONField(null=True, blank=True)

    # Identity
    user_id = models.TextField(null=True, blank=True)
    tenant_id = models.TextField(null=True, blank=True)
    role = models.TextField(null=True, blank=True)

    # Screen identity
    screen_id = models.TextField(null=True, blank=True)
    page_name = models.TextField(null=True, blank=True)

    # Integration
    bernstein_run_id = models.UUIDField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'feedback'
        managed = False  # Table already created by init.sql
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['project_id']),
            models.Index(fields=['type']),
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        return f"[{self.type}] {self.title}"
