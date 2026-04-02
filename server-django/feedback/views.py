from django.utils import timezone
from django.db import connection
from django.db.models import Count
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .models import Feedback
from .serializers import (
    FeedbackCreateSerializer,
    FeedbackListSerializer,
    FeedbackDetailSerializer,
)


# ── GET+POST /api/feedback/ ─────────────────────────────────────────
@api_view(['GET', 'POST'])
def feedback_root(request):
    """Combined root — POST creates, GET lists."""
    if request.method == 'POST':
        return _create_feedback(request)
    return _list_feedback(request)


def _create_feedback(request):
    """Accept new feedback — equivalent to Node's POST /api/feedback."""
    serializer = FeedbackCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {'success': False, 'error': 'Validation failed', 'details': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = serializer.validated_data
    ctx = data.get('context') or {}

    feedback = Feedback.objects.create(
        project_id=data['project_id'],
        type=data['type'],
        timestamp=data.get('timestamp') or timezone.now(),
        event_id=data.get('event_id'),
        title=data['title'],
        description=data.get('description'),
        category=data.get('category'),
        severity=data.get('severity'),
        impact=data.get('impact'),
        email=data.get('email'),
        context=data.get('context'),
        metadata=data.get('metadata'),
        screenshots=data.get('screenshots', []),
        highlighted_element=data.get('highlighted_element'),
        user_id=data.get('user_id'),
        tenant_id=data.get('tenant_id'),
        role=data.get('role'),
        screen_id=data.get('screen_id') or ctx.get('screenId'),
        page_name=data.get('page_name') or ctx.get('pageName'),
        bernstein_run_id=data.get('bernstein_run_id'),
    )

    return Response(
        {'success': True, 'id': str(feedback.id)},
        status=status.HTTP_201_CREATED,
    )


def _list_feedback(request):
    """List feedback with filters — equivalent to Node's GET /api/feedback."""
    qs = Feedback.objects.all()

    # Filters (same query params as Node server)
    project_id = request.query_params.get('project_id')
    fb_type = request.query_params.get('type')
    fb_status = request.query_params.get('status')
    severity = request.query_params.get('severity')

    if project_id:
        qs = qs.filter(project_id=project_id)
    if fb_type:
        qs = qs.filter(type=fb_type)
    if fb_status:
        qs = qs.filter(status=fb_status)
    if severity:
        qs = qs.filter(severity=severity)

    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))

    qs = qs.order_by('-created_at')[offset:offset + limit]

    serializer = FeedbackListSerializer(qs, many=True)
    return Response({
        'success': True,
        'data': serializer.data,
        'total': len(serializer.data),
    })


# ── GET /api/feedback/stats/summary ─────────────────────────────────
@api_view(['GET'])
def stats_summary(request):
    """Aggregated stats — equivalent to Node's GET /api/feedback/stats/summary."""
    qs = Feedback.objects.all()

    project_id = request.query_params.get('project_id')
    if project_id:
        qs = qs.filter(project_id=project_id)

    total = qs.count()

    by_type = dict(
        qs.values_list('type').annotate(count=Count('id')).values_list('type', 'count')
    )

    by_severity = dict(
        qs.exclude(severity__isnull=True)
        .values_list('severity')
        .annotate(count=Count('id'))
        .values_list('severity', 'count')
    )

    return Response({
        'success': True,
        'data': {
            'total': total,
            'by_type': by_type,
            'by_severity': by_severity,
        },
    })


# ── GET /api/feedback/<id>/ ─────────────────────────────────────────
@api_view(['GET'])
def get_feedback(request, pk):
    """Single feedback detail — equivalent to Node's GET /api/feedback/:id."""
    try:
        feedback = Feedback.objects.get(pk=pk)
    except Feedback.DoesNotExist:
        return Response(
            {'success': False, 'error': 'Not found'},
            status=status.HTTP_404_NOT_FOUND,
        )

    serializer = FeedbackDetailSerializer(feedback)
    return Response({'success': True, 'data': serializer.data})


# ── GET /health ─────────────────────────────────────────────────────
@api_view(['GET'])
def health_check(request):
    """Health check — equivalent to Node's GET /health."""
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        return Response({'status': 'ok', 'db': 'connected'})
    except Exception:
        return Response(
            {'status': 'error', 'db': 'disconnected'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
