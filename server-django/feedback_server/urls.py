from django.urls import path, include

urlpatterns = [
    # Support both /api/feedback and /api/feedback/
    path('api/feedback', include('feedback.urls')),
    path('api/feedback/', include('feedback.urls')),
    path('health', include('feedback.health_urls')),
]
