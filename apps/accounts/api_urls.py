from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import (
    AuthViewSet, UserViewSet, GroupViewSet, 
    list_permissions
)

app_name = 'accounts'

# 🔹 Register ViewSets with a Router
router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'groups', GroupViewSet, basename='group')

# 🔹 Custom Authentication Endpoints
auth_view = AuthViewSet.as_view({
    'post': 'login'
})

logout_view = AuthViewSet.as_view({
    'post': 'logout'
})

# 🔹 Define API URL patterns
urlpatterns = [
    # Authentication
    path('auth/login/', auth_view, name='user-login'),
    path('auth/logout/', logout_view, name='user-logout'),

    # Permissions API
    path('permissions/', list_permissions, name='list-permissions'),
]

# 🔹 Include ViewSet routes
urlpatterns += router.urls
