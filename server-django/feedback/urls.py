from django.urls import path
from . import views

urlpatterns = [
    path('', views.feedback_root),
    path('stats/summary', views.stats_summary),
    path('<uuid:pk>', views.get_feedback),
    path('<uuid:pk>/', views.get_feedback),
]
