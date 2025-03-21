"""Stream connection management for TS proxy"""

import threading
import logging
import time
import socket
import requests
import subprocess
from typing import Optional, List
from django.shortcuts import get_object_or_404
from apps.proxy.config import TSConfig as Config
from apps.channels.models import Channel, Stream
from apps.m3u.models import M3UAccount, M3UAccountProfile
from core.models import UserAgent, CoreSettings
from .stream_buffer import StreamBuffer
from .utils import detect_stream_type
from .redis_keys import RedisKeys
from .constants import ChannelState, EventType, StreamType, TS_PACKET_SIZE
from .config_helper import ConfigHelper
from .url_utils import get_alternate_streams, get_stream_info_for_switch

logger = logging.getLogger("ts_proxy")

class StreamManager:
    """Manages a connection to a TS stream without using raw sockets"""

    def __init__(self, channel_id, url, buffer, user_agent=None, transcode=False, stream_id=None):
        # Basic properties
        self.channel_id = channel_id
        self.url = url
        self.buffer = buffer
        self.running = True
        self.connected = False
        self.retry_count = 0
        self.max_retries = ConfigHelper.max_retries()
        self.current_response = None
        self.current_session = None
        self.url_switching = False

        # Sockets used for transcode jobs
        self.socket = None
        self.transcode = transcode
        self.transcode_process = None

        # User agent for connection
        self.user_agent = user_agent or Config.DEFAULT_USER_AGENT

        # Stream health monitoring
        self.last_data_time = time.time()
        self.healthy = True
        self.health_check_interval = ConfigHelper.get('HEALTH_CHECK_INTERVAL', 5)
        self.chunk_size = ConfigHelper.chunk_size()

        # Add to your __init__ method
        self._buffer_check_timers = []
        self.stopping = False

        # Add tracking for tried streams and current stream
        self.current_stream_id = stream_id
        self.tried_stream_ids = set()

        # IMPROVED LOGGING: Better handle and track stream ID
        if stream_id:
            self.tried_stream_ids.add(stream_id)
            logger.info(f"Initialized stream manager for channel {buffer.channel_id} with stream ID {stream_id}")
        else:
            # Try to get stream ID from Redis metadata if available
            if hasattr(buffer, 'redis_client') and buffer.redis_client:
                try:
                    metadata_key = RedisKeys.channel_metadata(channel_id)

                    # Log all metadata for debugging purposes
                    metadata = buffer.redis_client.hgetall(metadata_key)
                    if metadata:
                        logger.debug(f"Redis metadata for channel {channel_id}: {metadata}")

                    # Try to get stream_id specifically
                    stream_id_bytes = buffer.redis_client.hget(metadata_key, "stream_id")
                    if stream_id_bytes:
                        self.current_stream_id = int(stream_id_bytes.decode('utf-8'))
                        self.tried_stream_ids.add(self.current_stream_id)
                        logger.info(f"Loaded stream ID {self.current_stream_id} from Redis for channel {buffer.channel_id}")
                    else:
                        logger.warning(f"No stream_id found in Redis for channel {channel_id}")
                except Exception as e:
                    logger.warning(f"Error loading stream ID from Redis: {e}")
            else:
                logger.warning(f"Unable to get stream ID for channel {channel_id} - stream switching may not work correctly")

        logger.info(f"Initialized stream manager for channel {buffer.channel_id}")

    def _create_session(self):
        """Create and configure requests session with optimal settings"""
        session = requests.Session()

        # Configure session headers
        session.headers.update({
            'User-Agent': self.user_agent,
            'Connection': 'keep-alive'
        })

        # Set up connection pooling for better performance
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=1,     # Single connection for this stream
            pool_maxsize=1,         # Max size of connection pool
            max_retries=3,          # Auto-retry for failed requests
            pool_block=False        # Don't block when pool is full
        )

        # Apply adapter to both HTTP and HTTPS
        session.mount('http://', adapter)
        session.mount('https://', adapter)

        return session

    def run(self):
        """Main execution loop using HTTP streaming with improved connection handling and stream switching"""
        # Add a stop flag to the class properties
        self.stop_requested = False
        # Add tracking for stream switching attempts
        stream_switch_attempts = 0
        # Get max stream switches from config using the helper method
        max_stream_switches = ConfigHelper.max_stream_switches()  # Prevent infinite switching loops

        try:


            # Start health monitor thread
            health_thread = threading.Thread(target=self._monitor_health, daemon=True)
            health_thread.start()

            logger.info(f"Starting stream for URL: {self.url}")

            # Main stream switching loop - we'll try different streams if needed
            while self.running and stream_switch_attempts <= max_stream_switches:
                # Check stream type before connecting
                stream_type = detect_stream_type(self.url)
                if self.transcode == False and stream_type == StreamType.HLS:
                    logger.info(f"Detected HLS stream: {self.url}")
                    logger.info(f"HLS streams will be handled with FFmpeg for now - future version will support HLS natively")
                    # Enable transcoding for HLS streams
                    self.transcode = True
                    # We'll override the stream profile selection with ffmpeg in the transcoding section
                    self.force_ffmpeg = True
                # Reset connection retry count for this specific URL
                self.retry_count = 0
                url_failed = False
                if self.url_switching:
                    logger.debug("Skipping connection attempt during URL switch")
                    time.sleep(0.1)
                    continue
                # Connection retry loop for current URL
                while self.running and self.retry_count < self.max_retries and not url_failed:

                    logger.info(f"Connection attempt {self.retry_count + 1}/{self.max_retries} for URL: {self.url}")

                    # Handle connection based on whether we transcode or not
                    connection_result = False
                    try:
                        if self.transcode:
                            connection_result = self._establish_transcode_connection()
                        else:
                            connection_result = self._establish_http_connection()

                        if connection_result:
                            # Store connection start time to measure success duration
                            connection_start_time = time.time()

                            # Successfully connected - read stream data until disconnect/error
                            self._process_stream_data()
                            # If we get here, the connection was closed/failed

                            # Reset stream switch attempts if the connection lasted longer than threshold
                            # This indicates we had a stable connection for a while before failing
                            connection_duration = time.time() - connection_start_time
                            stable_connection_threshold = 30  # 30 seconds threshold
                            if connection_duration > stable_connection_threshold:
                                logger.info(f"Stream was stable for {connection_duration:.1f} seconds, resetting switch attempts counter")
                                stream_switch_attempts = 0

                        # Connection failed or ended - decide what to do next
                        if self.stop_requested or not self.running:
                            # Normal shutdown requested
                            return

                        # Connection failed, increment retry count
                        self.retry_count += 1
                        self.connected = False

                        # If we've reached max retries, mark this URL as failed
                        if self.retry_count >= self.max_retries:
                            url_failed = True
                            logger.warning(f"Maximum retry attempts ({self.max_retries}) reached for URL: {self.url}")
                        else:
                            # Wait with exponential backoff before retrying
                            timeout = min(.25 * self.retry_count, 3)  # Cap at 3 seconds
                            logger.info(f"Reconnecting in {timeout} seconds... (attempt {self.retry_count}/{self.max_retries})")
                            time.sleep(timeout)

                    except Exception as e:
                        logger.error(f"Connection error: {e}", exc_info=True)
                        self.retry_count += 1
                        self.connected = False

                        if self.retry_count >= self.max_retries:
                            url_failed = True
                        else:
                            # Wait with exponential backoff before retrying
                            timeout = min(.25 * self.retry_count, 3)  # Cap at 3 seconds
                            logger.info(f"Reconnecting in {timeout} seconds after error... (attempt {self.retry_count}/{self.max_retries})")
                            time.sleep(timeout)

                # If URL failed and we're still running, try switching to another stream
                if url_failed and self.running:
                    logger.info(f"URL {self.url} failed after {self.retry_count} attempts, trying next stream")

                    # Try to switch to next stream
                    switch_result = self._try_next_stream()
                    if switch_result:
                        # Successfully switched to a new stream, continue with the new URL
                        stream_switch_attempts += 1
                        logger.info(f"Successfully switched to new URL: {self.url} (switch attempt {stream_switch_attempts}/{max_stream_switches})")
                        # Reset retry count for the new stream - important for the loop to work correctly
                        self.retry_count = 0
                        # Continue outer loop with new URL - DON'T add a break statement here
                    else:
                        # No more streams to try
                        logger.error(f"Failed to find alternative streams after {stream_switch_attempts} attempts")
                        break
                elif not self.running:
                    # Normal shutdown was requested
                    break

        except Exception as e:
            logger.error(f"Stream error: {e}", exc_info=True)
        finally:
            self.connected = False
            self._close_all_connections()
            logger.info(f"Stream manager stopped")

    def _establish_transcode_connection(self):
        """Establish a connection using transcoding"""
        try:
            logger.debug(f"Building transcode command for channel {self.channel_id}")
            channel = get_object_or_404(Channel, uuid=self.channel_id)

            # Use FFmpeg specifically for HLS streams
            if hasattr(self, 'force_ffmpeg') and self.force_ffmpeg:
                from core.models import StreamProfile
                try:
                    stream_profile = StreamProfile.objects.get(name='ffmpeg', locked=True)
                    logger.info("Using FFmpeg stream profile for HLS content")
                except StreamProfile.DoesNotExist:
                    # Fall back to channel's profile if FFmpeg not found
                    stream_profile = channel.get_stream_profile()
                    logger.warning("FFmpeg profile not found, using channel default profile")
            else:
                stream_profile = channel.get_stream_profile()

            # Build and start transcode command
            self.transcode_cmd = stream_profile.build_command(self.url, self.user_agent)
            logger.debug(f"Starting transcode process: {self.transcode_cmd}")

            self.transcode_process = subprocess.Popen(
                self.transcode_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,  # Suppress FFmpeg logs
                bufsize=188 * 64            # Buffer optimized for TS packets
            )

            self.socket = self.transcode_process.stdout  # Read from FFmpeg output
            self.connected = True

            # Set channel state to waiting for clients
            self._set_waiting_for_clients()

            return True
        except Exception as e:
            logger.error(f"Error establishing transcode connection: {e}", exc_info=True)
            self._close_socket()
            return False

    def _establish_http_connection(self):
        """Establish a direct HTTP connection to the stream"""
        try:
            logger.debug(f"Using TS Proxy to connect to stream: {self.url}")

            # Create new session for each connection attempt
            session = self._create_session()
            self.current_session = session

            # Stream the URL with proper timeout handling
            response = session.get(
                self.url,
                stream=True,
                timeout=(10, 60)  # 10s connect timeout, 60s read timeout
            )
            self.current_response = response

            if response.status_code == 200:
                self.connected = True
                self.healthy = True
                logger.info(f"Successfully connected to stream source")

                # Set channel state to waiting for clients
                self._set_waiting_for_clients()

                return True
            else:
                logger.error(f"Failed to connect to stream: HTTP {response.status_code}")
                self._close_connection()
                return False
        except requests.exceptions.RequestException as e:
            logger.error(f"HTTP request error: {e}")
            self._close_connection()
            return False
        except Exception as e:
            logger.error(f"Error establishing HTTP connection: {e}", exc_info=True)
            self._close_connection()
            return False

    def _process_stream_data(self):
        """Process stream data until disconnect or error"""
        try:
            if self.transcode:
                # Handle transcoded stream data
                while self.running and self.connected:
                    if self.fetch_chunk():
                        self.last_data_time = time.time()
                    else:
                        if not self.running:
                            break
                        time.sleep(0.1)
            else:
                # Handle direct HTTP connection
                chunk_count = 0
                try:
                    for chunk in self.current_response.iter_content(chunk_size=self.chunk_size):
                        # Check if we've been asked to stop
                        if self.stop_requested or self.url_switching:
                            break

                        if chunk:
                            # Add chunk to buffer with TS packet alignment
                            success = self.buffer.add_chunk(chunk)

                            if success:
                                self.last_data_time = time.time()
                                chunk_count += 1

                                # Update last data timestamp in Redis
                                if hasattr(self.buffer, 'redis_client') and self.buffer.redis_client:
                                    last_data_key = RedisKeys.last_data(self.buffer.channel_id)
                                    self.buffer.redis_client.set(last_data_key, str(time.time()), ex=60)
                except (AttributeError, ConnectionError) as e:
                    if self.stop_requested or self.url_switching:
                        logger.debug(f"Expected connection error during shutdown/URL switch: {e}")
                    else:
                        logger.error(f"Unexpected stream error: {e}")
                        raise
        except Exception as e:
            logger.error(f"Error processing stream data: {e}", exc_info=True)

        # If we exit the loop, connection is closed or failed
        self.connected = False

    def _close_all_connections(self):
        """Close all connection resources"""
        if self.socket:
            try:
                self._close_socket()
            except Exception as e:
                logger.debug(f"Error closing socket: {e}")

        if self.current_response:
            try:
                self.current_response.close()
            except Exception as e:
                logger.debug(f"Error closing response: {e}")

        if self.current_session:
            try:
                self.current_session.close()
            except Exception as e:
                logger.debug(f"Error closing session: {e}")

        # Clear references
        self.socket = None
        self.current_response = None
        self.current_session = None
        self.transcode_process = None

    def stop(self):
        """Stop the stream manager and cancel all timers"""
        # Add at the beginning of your stop method
        self.stopping = True

        # Cancel all buffer check timers
        for timer in list(self._buffer_check_timers):
            try:
                if timer and timer.is_alive():
                    timer.cancel()
            except Exception as e:
                logger.error(f"Error canceling buffer check timer: {e}")

        self._buffer_check_timers.clear()

        # Rest of your existing stop method...
        # Set the flag first
        self.stop_requested = True

        # Close any active response connection
        if hasattr(self, 'current_response') and self.current_response:  # CORRECT NAME
            try:
                self.current_response.close()  # CORRECT NAME
            except Exception:
                pass

        # Also close the session
        if hasattr(self, 'current_session') and self.current_session:
            try:
                self.current_session.close()
            except Exception:
                pass

        # Set running to false to ensure thread exits
        self.running = False

    def update_url(self, new_url):
        """Update stream URL and reconnect with proper cleanup for both HTTP and transcode sessions"""
        if new_url == self.url:
            logger.info(f"URL unchanged: {new_url}")
            return False

        logger.info(f"Switching stream URL from {self.url} to {new_url}")

        # CRITICAL: Set a flag to prevent immediate reconnection with old URL
        self.url_switching = True

        # Check which type of connection we're using and close it properly
        if self.transcode or self.socket:
            logger.debug("Closing transcode process before URL change")
            self._close_socket()
        else:
            logger.debug("Closing HTTP connection before URL change")
            self._close_connection()

        # Update URL and reset connection state
        old_url = self.url
        self.url = new_url
        self.connected = False

        # Reset retry counter to allow immediate reconnect
        self.retry_count = 0

        # Reset tried streams when manually switching URL
        self.tried_stream_ids = set()

        # Also reset buffer position to prevent stale data after URL change
        if hasattr(self.buffer, 'reset_buffer_position'):
            try:
                self.buffer.reset_buffer_position()
                logger.debug("Reset buffer position for clean URL switch")
            except Exception as e:
                logger.warning(f"Failed to reset buffer position: {e}")

        # Done with URL switch
        self.url_switching = False
        logger.info(f"Stream switch completed for channel {self.buffer.channel_id}")

        return True

    def should_retry(self) -> bool:
        """Check if connection retry is allowed"""
        return self.retry_count < self.max_retries

    def _monitor_health(self):
        """Monitor stream health and attempt recovery if needed"""
        while self.running:
            try:
                now = time.time()
                if now - self.last_data_time > getattr(Config, 'CONNECTION_TIMEOUT', 10) and self.connected:
                    # Mark unhealthy if no data for too long
                    if self.healthy:
                        logger.warning(f"Stream unhealthy - no data for {now - self.last_data_time:.1f}s")
                        self.healthy = False
                elif self.connected and not self.healthy:
                    # Auto-recover health when data resumes
                    logger.info(f"Stream health restored")
                    self.healthy = True

            except Exception as e:
                logger.error(f"Error in health monitor: {e}")

            time.sleep(self.health_check_interval)

    def _close_connection(self):
        """Close HTTP connection resources"""
        # Close response if it exists
        if hasattr(self, 'current_response') and self.current_response:
            try:
                self.current_response.close()
            except Exception as e:
                logger.debug(f"Error closing response: {e}")
            self.current_response = None

        # Close session if it exists
        if hasattr(self, 'current_session') and self.current_session:
            try:
                self.current_session.close()
            except Exception as e:
                logger.debug(f"Error closing session: {e}")
            self.current_session = None

    def _close_socket(self):
        """Close socket and transcode resources as needed"""
        # First try to use _close_connection for HTTP resources
        if self.current_response or self.current_session:
            self._close_connection()
            return

        # Otherwise handle socket and transcode resources
        if self.socket:
            try:
                self.socket.close()
            except Exception as e:
                logger.debug(f"Error closing socket: {e}")
                pass

            self.socket = None
            self.connected = False

        if self.transcode_process:
            try:
                self.transcode_process.terminate()
                self.transcode_process.wait()
            except Exception as e:
                logger.debug(f"Error terminating transcode process: {e}")
                pass

            self.transcode_process = None

    def fetch_chunk(self):
        """Fetch data from socket with direct pass-through to buffer"""
        if not self.connected or not self.socket:
            return False

        try:
            # Read data chunk - no need to align with TS packet size anymore
            try:
                # Try to read data chunk
                if hasattr(self.socket, 'recv'):
                    chunk = self.socket.recv(Config.CHUNK_SIZE)  # Standard socket
                else:
                    chunk = self.socket.read(Config.CHUNK_SIZE)  # SocketIO object

            except AttributeError:
                # Fall back to read() if recv() isn't available
                chunk = self.socket.read(Config.CHUNK_SIZE)

            if not chunk:
                # Connection closed by server
                logger.warning("Server closed connection")
                self._close_socket()
                self.connected = False
                return False

            # Add directly to buffer without TS-specific processing
            success = self.buffer.add_chunk(chunk)

            # Update last data timestamp in Redis if successful
            if success and hasattr(self.buffer, 'redis_client') and self.buffer.redis_client:
                last_data_key = RedisKeys.last_data(self.buffer.channel_id)
                self.buffer.redis_client.set(last_data_key, str(time.time()), ex=60)

            return True

        except (socket.timeout, socket.error) as e:
            # Socket error
            logger.error(f"Socket error: {e}")
            self._close_socket()
            self.connected = False
            return False

        except Exception as e:
            logger.error(f"Error in fetch_chunk: {e}")
            return False

    def _set_waiting_for_clients(self):
        """Set channel state to waiting for clients AFTER buffer has enough chunks"""
        try:
            if hasattr(self.buffer, 'channel_id') and hasattr(self.buffer, 'redis_client'):
                channel_id = self.buffer.channel_id
                redis_client = self.buffer.redis_client

                if channel_id and redis_client:
                    current_time = str(time.time())
                    metadata_key = RedisKeys.channel_metadata(channel_id)

                    # Check current state first
                    current_state = None
                    try:
                        metadata = redis_client.hgetall(metadata_key)
                        if metadata and b'state' in metadata:
                            current_state = metadata[b'state'].decode('utf-8')
                    except Exception as e:
                        logger.error(f"Error checking current state: {e}")

                    # Only update if not already past connecting
                    if not current_state or current_state in [ChannelState.INITIALIZING, ChannelState.CONNECTING]:
                        # NEW CODE: Check if buffer has enough chunks
                        current_buffer_index = getattr(self.buffer, 'index', 0)
                        initial_chunks_needed = ConfigHelper.initial_behind_chunks()

                        if current_buffer_index < initial_chunks_needed:
                            # Not enough buffer yet - set to connecting state if not already
                            if current_state != ChannelState.CONNECTING:
                                update_data = {
                                    "state": ChannelState.CONNECTING,
                                    "state_changed_at": current_time
                                }
                                redis_client.hset(metadata_key, mapping=update_data)
                                logger.info(f"Channel {channel_id} connected but waiting for buffer to fill: {current_buffer_index}/{initial_chunks_needed} chunks")

                            # Schedule a retry to check buffer status again
                            timer = threading.Timer(0.5, self._check_buffer_and_set_state)
                            timer.daemon = True
                            timer.start()
                            return False

                        # We have enough buffer, proceed with state change
                        update_data = {
                            "state": ChannelState.WAITING_FOR_CLIENTS,
                            "connection_ready_time": current_time,
                            "state_changed_at": current_time,
                            "buffer_chunks": str(current_buffer_index)
                        }
                        redis_client.hset(metadata_key, mapping=update_data)

                        # Get configured grace period or default
                        grace_period = ConfigHelper.get('CHANNEL_INIT_GRACE_PERIOD', 20)
                        logger.info(f"STREAM MANAGER: Updated channel {channel_id} state: {current_state or 'None'} → {ChannelState.WAITING_FOR_CLIENTS} with {current_buffer_index} buffer chunks")
                        logger.info(f"Started initial connection grace period ({grace_period}s) for channel {channel_id}")
                    else:
                        logger.debug(f"Not changing state: channel {channel_id} already in {current_state} state")
        except Exception as e:
            logger.error(f"Error setting waiting for clients state: {e}")

    def _check_buffer_and_set_state(self):
        """Check buffer size and set state to waiting_for_clients when ready"""
        try:
            # First check if we're stopping or reconnecting
            if getattr(self, 'stopping', False) or getattr(self, 'reconnecting', False):
                logger.debug(f"Buffer check aborted - channel {self.buffer.channel_id} is stopping or reconnecting")
                return

            # Clean up completed timers
            self._buffer_check_timers = [t for t in self._buffer_check_timers if t.is_alive()]

            if hasattr(self.buffer, 'index') and hasattr(self.buffer, 'channel_id'):
                current_buffer_index = self.buffer.index
                initial_chunks_needed = getattr(Config, 'INITIAL_BEHIND_CHUNKS', 10)
                channel_id = self.buffer.channel_id

                if current_buffer_index >= initial_chunks_needed:
                    # We now have enough buffer, call _set_waiting_for_clients again
                    logger.info(f"Buffer threshold reached for channel {channel_id}: {current_buffer_index}/{initial_chunks_needed} chunks")
                    self._set_waiting_for_clients()
                else:
                    # Still waiting, log progress and schedule another check
                    logger.debug(f"Buffer filling for channel {channel_id}: {current_buffer_index}/{initial_chunks_needed} chunks")

                    # Schedule another check - NOW WITH TRACKING
                    if not getattr(self, 'stopping', False):
                        timer = threading.Timer(0.5, self._check_buffer_and_set_state)
                        timer.daemon = True
                        timer.start()
                        self._buffer_check_timers.append(timer)
        except Exception as e:
            logger.error(f"Error in buffer check: {e}")

    def _try_next_stream(self):
        """
        Try to switch to the next available stream for this channel.

        Returns:
            bool: True if successfully switched to a new stream, False otherwise
        """
        try:
            logger.info(f"Trying to find alternative stream for channel {self.channel_id}, current stream ID: {self.current_stream_id}")

            # Get alternate streams excluding the current one
            alternate_streams = get_alternate_streams(self.channel_id, self.current_stream_id)
            logger.info(f"Found {len(alternate_streams)} potential alternate streams for channel {self.channel_id}")

            # Filter out streams we've already tried
            untried_streams = [s for s in alternate_streams if s['stream_id'] not in self.tried_stream_ids]
            if untried_streams:
                ids_to_try = ', '.join([str(s['stream_id']) for s in untried_streams])
                logger.info(f"Found {len(untried_streams)} untried streams for channel {self.channel_id}: [{ids_to_try}]")
            else:
                logger.warning(f"No untried streams available for channel {self.channel_id}, tried: {self.tried_stream_ids}")

            if not untried_streams:
                # Check if we have streams but they've all been tried
                if alternate_streams and len(self.tried_stream_ids) > 0:
                    logger.warning(f"All {len(alternate_streams)} alternate streams have been tried for channel {self.channel_id}")
                return False

            # Get the next stream to try
            next_stream = untried_streams[0]
            stream_id = next_stream['stream_id']

            # Add to tried streams
            self.tried_stream_ids.add(stream_id)

            # Get stream info including URL
            logger.info(f"Trying next stream ID {stream_id} for channel {self.channel_id}")
            stream_info = get_stream_info_for_switch(self.channel_id, stream_id)

            if 'error' in stream_info or not stream_info.get('url'):
                logger.error(f"Error getting info for stream {stream_id}: {stream_info.get('error', 'No URL')}")
                return False

            # Update URL and user agent
            new_url = stream_info['url']
            new_user_agent = stream_info['user_agent']
            new_transcode = stream_info['transcode']

            logger.info(f"Switching from URL {self.url} to {new_url} for channel {self.channel_id}")

            # Update stream ID tracking
            self.current_stream_id = stream_id

            # Store the new user agent and transcode settings
            self.user_agent = new_user_agent
            self.transcode = new_transcode

            # Update stream metadata in Redis
            if hasattr(self.buffer, 'redis_client') and self.buffer.redis_client:
                metadata_key = RedisKeys.channel_metadata(self.channel_id)
                self.buffer.redis_client.hset(metadata_key, mapping={
                    "url": new_url,
                    "user_agent": new_user_agent,
                    "profile": stream_info['profile'],
                    "stream_id": str(stream_id),
                    "stream_switch_time": str(time.time()),
                    "stream_switch_reason": "max_retries_exceeded"
                })

                # Log the switch
                logger.info(f"Stream metadata updated for channel {self.channel_id} to stream ID {stream_id}")

            # IMPORTANT: Just update the URL, don't stop the channel or release resources
            switch_result = self.update_url(new_url)
            if not switch_result:
                logger.error(f"Failed to update URL for stream ID {stream_id}")
                return False

            logger.info(f"Successfully switched to stream ID {stream_id} with URL {new_url}")
            return True

        except Exception as e:
            logger.error(f"Error trying next stream for channel {self.channel_id}: {e}", exc_info=True)
            return False


