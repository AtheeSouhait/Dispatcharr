from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import (
    StreamViewSet,
    ChannelViewSet,
    ChannelGroupViewSet,
    BulkDeleteStreamsAPIView,
    BulkDeleteChannelsViewSet
)

app_name = 'channels'  # for DRF routing

router = DefaultRouter()
router.register(r'streams', StreamViewSet, basename='stream')
router.register(r'groups', ChannelGroupViewSet, basename='channel-group')
router.register(r'channels', ChannelViewSet, basename='channel')
router.register(r'bulk-delete-channels', BulkDeleteChannelsViewSet, basename='bulk-delete-channels')

urlpatterns = [
    # Bulk delete for streams is a single APIView, not a ViewSet
    path('streams/bulk-delete/', BulkDeleteStreamsAPIView.as_view(), name='bulk_delete_streams'),
]

urlpatterns += router.urls
