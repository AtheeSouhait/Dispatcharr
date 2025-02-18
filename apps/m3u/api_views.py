from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi
from django.shortcuts import get_object_or_404
from django.http import JsonResponse
from django.core.cache import cache
from .models import M3UAccount, M3UFilter, ServerGroup
from .serializers import M3UAccountSerializer, M3UFilterSerializer, ServerGroupSerializer
from .tasks import refresh_single_m3u_account, refresh_m3u_accounts


# 🔹 1) M3U Account API (CRUD)
class M3UAccountViewSet(viewsets.ModelViewSet):
    """Handles CRUD operations for M3U accounts"""
    queryset = M3UAccount.objects.all()
    serializer_class = M3UAccountSerializer
    permission_classes = [IsAuthenticated]


# 🔹 2) M3U Filter API (CRUD)
class M3UFilterViewSet(viewsets.ModelViewSet):
    """Handles CRUD operations for M3U filters"""
    queryset = M3UFilter.objects.all()
    serializer_class = M3UFilterSerializer
    permission_classes = [IsAuthenticated]


# 🔹 3) Server Group API (CRUD)
class ServerGroupViewSet(viewsets.ModelViewSet):
    """Handles CRUD operations for Server Groups"""
    queryset = ServerGroup.objects.all()
    serializer_class = ServerGroupSerializer
    permission_classes = [IsAuthenticated]


# 🔹 4) Refresh All M3U Accounts
class RefreshM3UAPIView(APIView):
    """Triggers refresh for all active M3U accounts"""

    @swagger_auto_schema(
        operation_description="Triggers a refresh of all active M3U accounts",
        responses={202: "M3U refresh initiated"}
    )
    def post(self, request, format=None):
        refresh_m3u_accounts.delay()
        return Response({'success': True, 'message': 'M3U refresh initiated.'}, status=status.HTTP_202_ACCEPTED)


# 🔹 5) Refresh Single M3U Account
class RefreshSingleM3UAPIView(APIView):
    """Triggers refresh for a single M3U account"""

    @swagger_auto_schema(
        operation_description="Triggers a refresh of a single M3U account",
        responses={202: "M3U account refresh initiated"}
    )
    def post(self, request, account_id, format=None):
        refresh_single_m3u_account.delay(account_id)
        return Response({'success': True, 'message': f'M3U account {account_id} refresh initiated.'}, status=status.HTTP_202_ACCEPTED)
