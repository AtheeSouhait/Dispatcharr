import json
import threading
import time
import random
import re
from django.http import StreamingHttpResponse, JsonResponse, HttpResponseRedirect
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import get_object_or_404
from apps.proxy.config import TSConfig as Config
from . import proxy_server
from .channel_status import ChannelStatus
from .stream_generator import create_stream_generator
from .utils import get_client_ip
from .redis_keys import RedisKeys
import logging
from apps.channels.models import Channel, Stream
from apps.m3u.models import M3UAccount, M3UAccountProfile
from core.models import UserAgent, CoreSettings, PROXY_PROFILE_NAME
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from .constants import ChannelState, EventType, StreamType, ChannelMetadataField
from .config_helper import ConfigHelper
from .services.channel_service import ChannelService
from .url_utils import generate_stream_url, transform_url, get_stream_info_for_switch, get_stream_object, get_alternate_streams
from .utils import get_logger
from uuid import UUID

logger = get_logger()


@api_view(['GET'])
def stream_ts(request, channel_id):
    """Stream TS data to client with immediate response and keep-alive packets during initialization"""
    channel = get_stream_object(channel_id)

    client_user_agent = None

    try:
        # Generate a unique client ID
        client_id = f"client_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
        client_ip = get_client_ip(request)
        logger.info(f"[{client_id}] Requested stream for channel {channel_id}")

        # Extract client user agent early
        for header in ['HTTP_USER_AGENT', 'User-Agent', 'user-agent']:
            if header in request.META:
                client_user_agent = request.META[header]
                logger.debug(f"[{client_id}] Client connected with user agent: {client_user_agent}")
                break

        # Check if we need to reinitialize the channel
        needs_initialization = True
        channel_state = None

        # Get current channel state from Redis if available
        if proxy_server.redis_client:
            metadata_key = RedisKeys.channel_metadata(channel_id)
            if proxy_server.redis_client.exists(metadata_key):
                metadata = proxy_server.redis_client.hgetall(metadata_key)
                state_field = ChannelMetadataField.STATE.encode('utf-8')
                if state_field in metadata:
                    channel_state = metadata[state_field].decode('utf-8')

                    # Only skip initialization if channel is in a healthy state
                    valid_states = [ChannelState.ACTIVE, ChannelState.WAITING_FOR_CLIENTS]
                    if channel_state in valid_states:
                        # Verify the owner is still active
                        owner_field = ChannelMetadataField.OWNER.encode('utf-8')
                        if owner_field in metadata:
                            owner = metadata[owner_field].decode('utf-8')
                            owner_heartbeat_key = f"ts_proxy:worker:{owner}:heartbeat"
                            if proxy_server.redis_client.exists(owner_heartbeat_key):
                                # Owner is active and channel is in good state
                                needs_initialization = False
                                logger.info(f"[{client_id}] Channel {channel_id} in state {channel_state} with active owner {owner}")

        # Start initialization if needed
        channel_initializing = False
        if needs_initialization or not proxy_server.check_if_channel_exists(channel_id):
            # Force cleanup of any previous instance
            if channel_state in [ChannelState.ERROR, ChannelState.STOPPING, ChannelState.STOPPED]:
                logger.warning(f"[{client_id}] Channel {channel_id} in state {channel_state}, forcing cleanup")
                proxy_server.stop_channel(channel_id)

            # Initialize the channel (but don't wait for completion)
            logger.info(f"[{client_id}] Starting channel {channel_id} initialization")

            # Use the utility function to get stream URL and settings
            stream_url, stream_user_agent, transcode, profile_value = generate_stream_url(channel_id)
            if stream_url is None:
                return JsonResponse({'error': 'Channel not available'}, status=404)

            # Get the stream ID from the channel
            stream_id, m3u_profile_id = channel.get_stream()
            logger.info(f"Channel {channel_id} using stream ID {stream_id}, m3u account profile ID {m3u_profile_id}")

            # Generate transcode command if needed
            stream_profile = channel.get_stream_profile()
            if stream_profile.is_redirect():
                return HttpResponseRedirect(stream_url)

            # Initialize channel with the stream's user agent (not the client's)
            success = ChannelService.initialize_channel(
                channel_id, stream_url, stream_user_agent, transcode, profile_value, stream_id, m3u_profile_id
            )

            if not success:
                return JsonResponse({'error': 'Failed to initialize channel'}, status=500)

            # If we're the owner, wait for connection to establish
            if proxy_server.am_i_owner(channel_id):
                manager = proxy_server.stream_managers.get(channel_id)
                if manager:
                    wait_start = time.time()
                    timeout = ConfigHelper.connection_timeout()
                    while not manager.connected:
                        if time.time() - wait_start > timeout:
                            proxy_server.stop_channel(channel_id)
                            return JsonResponse({'error': 'Connection timeout'}, status=504)
                        if not manager.should_retry():
                            proxy_server.stop_channel(channel_id)
                            return JsonResponse({'error': 'Failed to connect'}, status=502)
                        time.sleep(0.1)

            logger.info(f"[{client_id}] Successfully initialized channel {channel_id}")
            channel_initializing = True
            logger.info(f"[{client_id}] Channel {channel_id} initialization started")

        # Register client - can do this regardless of initialization state
        # Create local resources if needed
        if channel_id not in proxy_server.stream_buffers or channel_id not in proxy_server.client_managers:
            logger.debug(f"[{client_id}] Channel {channel_id} exists in Redis but not initialized in this worker - initializing now")

            # Get URL from Redis metadata
            url = None
            stream_user_agent = None  # Initialize the variable

            if proxy_server.redis_client:
                metadata_key = RedisKeys.channel_metadata(channel_id)
                url_bytes = proxy_server.redis_client.hget(metadata_key, ChannelMetadataField.URL)
                ua_bytes = proxy_server.redis_client.hget(metadata_key, ChannelMetadataField.USER_AGENT)
                profile_bytes = proxy_server.redis_client.hget(metadata_key, ChannelMetadataField.STREAM_PROFILE)

                if url_bytes:
                    url = url_bytes.decode('utf-8')
                if ua_bytes:
                    stream_user_agent = ua_bytes.decode('utf-8')
                # Extract transcode setting from Redis
                if profile_bytes:
                    profile_str = profile_bytes.decode('utf-8')
                    use_transcode = (profile_str == PROXY_PROFILE_NAME or profile_str == 'None')
                    logger.debug(f"Using profile '{profile_str}' for channel {channel_id}, transcode={use_transcode}")
                else:
                    # Default settings when profile not found in Redis
                    profile_str = 'None'  # Default profile name
                    use_transcode = False  # Default to direct streaming without transcoding
                    logger.debug(f"No profile found in Redis for channel {channel_id}, defaulting to transcode={use_transcode}")

            # Use client_user_agent as fallback if stream_user_agent is None
            success = proxy_server.initialize_channel(url, channel_id, stream_user_agent or client_user_agent, use_transcode)
            if not success:
                logger.error(f"[{client_id}] Failed to initialize channel {channel_id} locally")
                return JsonResponse({'error': 'Failed to initialize channel locally'}, status=500)

            logger.info(f"[{client_id}] Successfully initialized channel {channel_id} locally")

        # Register client
        buffer = proxy_server.stream_buffers[channel_id]
        client_manager = proxy_server.client_managers[channel_id]
        client_manager.add_client(client_id, client_ip, client_user_agent)
        logger.info(f"[{client_id}] Client registered with channel {channel_id}")

        # Create a stream generator for this client
        generate = create_stream_generator(
            channel_id, client_id, client_ip, client_user_agent, channel_initializing
        )

        # Return the StreamingHttpResponse from the main function
        response = StreamingHttpResponse(
            streaming_content=generate(),
            content_type='video/mp2t'
        )
        response['Cache-Control'] = 'no-cache'
        return response

    except Exception as e:
        logger.error(f"Error in stream_ts: {e}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@api_view(['POST'])
#@permission_classes([IsAuthenticated])
def change_stream(request, channel_id):
    """Change stream URL for existing channel with enhanced diagnostics"""
    try:
        data = json.loads(request.body)
        new_url = data.get('url')
        user_agent = data.get('user_agent')

        if not new_url:
            return JsonResponse({'error': 'No URL provided'}, status=400)

        logger.info(f"Attempting to change stream URL for channel {channel_id} to {new_url}")

        # Use the service layer instead of direct implementation
        result = ChannelService.change_stream_url(channel_id, new_url, user_agent)

        if result.get('status') == 'error':
            return JsonResponse({
                'error': result.get('message', 'Unknown error'),
                'diagnostics': result.get('diagnostics', {})
            }, status=404)

        # Format response based on whether it was a direct update or event-based
        if result.get('direct_update'):
            return JsonResponse({
                'message': 'Stream URL updated',
                'channel': channel_id,
                'url': new_url,
                'owner': True,
                'worker_id': proxy_server.worker_id
            })
        else:
            return JsonResponse({
                'message': 'Stream URL change requested',
                'channel': channel_id,
                'url': new_url,
                'owner': False,
                'worker_id': proxy_server.worker_id
            })

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f"Failed to change stream: {e}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=500)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def channel_status(request, channel_id=None):
    """
    Returns status information about channels with detail level based on request:
    - /status/ returns basic summary of all channels
    - /status/{channel_id} returns detailed info about specific channel
    """
    try:
        # Check if Redis is available
        if not proxy_server.redis_client:
            return JsonResponse({'error': 'Redis connection not available'}, status=500)

        # Handle single channel or all channels
        if channel_id:
            # Detailed info for specific channel
            channel_info = ChannelStatus.get_detailed_channel_info(channel_id)
            if channel_info:
                return JsonResponse(channel_info)
            else:
                return JsonResponse({'error': f'Channel {channel_id} not found'}, status=404)
        else:
            # Basic info for all channels
            channel_pattern = "ts_proxy:channel:*:metadata"
            all_channels = []

            # Extract channel IDs from keys
            cursor = 0
            while True:
                cursor, keys = proxy_server.redis_client.scan(cursor, match=channel_pattern)
                for key in keys:
                    channel_id_match = re.search(r"ts_proxy:channel:(.*):metadata", key.decode('utf-8'))
                    if channel_id_match:
                        ch_id = channel_id_match.group(1)
                        channel_info = ChannelStatus.get_basic_channel_info(ch_id)
                        if channel_info:
                            all_channels.append(channel_info)

                if cursor == 0:
                    break

            return JsonResponse({'channels': all_channels, 'count': len(all_channels)})

    except Exception as e:
        logger.error(f"Error in channel_status: {e}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def stop_channel(request, channel_id):
    """Stop a channel and release all associated resources using PubSub events"""
    try:
        logger.info(f"Request to stop channel {channel_id} received")

        # Use the service layer instead of direct implementation
        result = ChannelService.stop_channel(channel_id)

        if result.get('status') == 'error':
            return JsonResponse({'error': result.get('message', 'Unknown error')}, status=404)

        return JsonResponse({
            'message': 'Channel stop request sent',
            'channel_id': channel_id,
            'previous_state': result.get('previous_state')
        })

    except Exception as e:
        logger.error(f"Failed to stop channel: {e}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def stop_client(request, channel_id):
    """Stop a specific client connection using existing client management"""
    try:
        # Parse request body to get client ID
        data = json.loads(request.body)
        client_id = data.get('client_id')

        if not client_id:
            return JsonResponse({'error': 'No client_id provided'}, status=400)

        # Use the service layer instead of direct implementation
        result = ChannelService.stop_client(channel_id, client_id)

        if result.get('status') == 'error':
            return JsonResponse({'error': result.get('message')}, status=404)

        return JsonResponse({
            'message': 'Client stop request processed',
            'channel_id': channel_id,
            'client_id': client_id,
            'locally_processed': result.get('locally_processed', False)
        })

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f"Failed to stop client: {e}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@api_view(['POST'])
#@permission_classes([IsAuthenticated])
def next_stream(request, channel_id):
    """Switch to the next available stream for a channel"""
    try:
        logger.info(f"Request to switch to next stream for channel {channel_id} received")

        # First check if channel is active in Redis
        current_stream_id = None
        profile_id = None

        if proxy_server.redis_client:
            metadata_key = RedisKeys.channel_metadata(channel_id)
            if proxy_server.redis_client.exists(metadata_key):
                # Get current stream ID from Redis
                stream_id_bytes = proxy_server.redis_client.hget(metadata_key, ChannelMetadataField.STREAM_ID)
                if stream_id_bytes:
                    current_stream_id = int(stream_id_bytes.decode('utf-8'))
                    logger.info(f"Found current stream ID {current_stream_id} in Redis for channel {channel_id}")

                    # Get M3U profile from Redis if available
                    profile_id_bytes = proxy_server.redis_client.hget(metadata_key, ChannelMetadataField.M3U_PROFILE)
                    if profile_id_bytes:
                        profile_id = int(profile_id_bytes.decode('utf-8'))
                        logger.info(f"Found M3U profile ID {profile_id} in Redis for channel {channel_id}")

        if not current_stream_id:
            # Channel is not running
            return JsonResponse({'error': 'No current stream found for channel'}, status=404)

        # Get alternate streams excluding the current one
        alternate_streams = get_alternate_streams(channel_id, current_stream_id)

        if not alternate_streams:
            return JsonResponse({
                'error': 'No alternate streams available for this channel',
                'current_stream_id': current_stream_id
            }, status=404)

        # Pick the next stream from alternatives
        next_stream = alternate_streams[0]  # Get the first alternative
        next_stream_id = next_stream['stream_id']

        # Get full stream info including URL for the next stream
        stream_info = get_stream_info_for_switch(channel_id, next_stream_id)

        if 'error' in stream_info:
            return JsonResponse({
                'error': stream_info['error'],
                'current_stream_id': current_stream_id,
                'next_stream_id': next_stream_id
            }, status=404)

        # Now use the ChannelService to change the stream URL
        result = ChannelService.change_stream_url(
            channel_id,
            stream_info['url'],
            stream_info['user_agent'],
            next_stream_id  # Pass the stream_id to be stored in Redis
        )

        if result.get('status') == 'error':
            return JsonResponse({
                'error': result.get('message', 'Unknown error'),
                'diagnostics': result.get('diagnostics', {}),
                'current_stream_id': current_stream_id,
                'next_stream_id': next_stream_id
            }, status=404)

        # Format success response
        response_data = {
            'message': 'Stream switched to next available',
            'channel': channel_id,
            'previous_stream_id': current_stream_id,
            'new_stream_id': next_stream_id,
            'new_url': stream_info['url'],
            'owner': result.get('direct_update', False),
            'worker_id': proxy_server.worker_id
        }

        return JsonResponse(response_data)

    except Exception as e:
        logger.error(f"Failed to switch to next stream: {e}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=500)
