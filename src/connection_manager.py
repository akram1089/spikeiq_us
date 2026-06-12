import asyncio
from loguru import logger
from ib_insync import IB
from config import settings

class ConnectionManager:
    """Manages the connection lifecycle to Interactive Brokers Gateway."""
    
    def __init__(self, client_id: int | None = None):
        self.ib = None
        self.host = settings.IB_HOST
        self.port = settings.IB_PORT
        self.client_id = client_id if client_id is not None else settings.IB_CLIENT_ID
        
        self._reconnecting = False
        self._reconnect_task = None
        
        # Async helper event to notify when connected
        self.connected_event = asyncio.Event()

    async def connect(self) -> bool:
        """Asynchronously connects to the IB Gateway API."""
        if self.ib is None:
            self.ib = IB()
            self.ib.connectedEvent += self._on_connected
            self.ib.disconnectedEvent += self._on_disconnected
            self.ib.errorEvent += self._on_error

        if self.ib.isConnected():
            logger.info("Already connected to IB Gateway.")
            return True
            
        logger.info(f"Connecting to IB Gateway at {self.host}:{self.port} (Client ID: {self.client_id})...")
        try:
            readonly = getattr(settings, "READ_ONLY_API", False)
            await self.ib.connectAsync(self.host, self.port, clientId=self.client_id, readonly=readonly)
            self.ib.reqMarketDataType(1)  # Request LIVE real-time market data (market is open)
            logger.success("Successfully connected to IB Gateway and requested LIVE market data (type=1).")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to IB Gateway: {e}")
            self._start_reconnect_loop()
            return False

    def disconnect(self):
        """Disconnects from the IB Gateway and stops reconnection tasks."""
        logger.info("Disconnecting from IB Gateway...")
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            logger.info("Cancelled reconnection task.")
        if self.ib and self.ib.isConnected():
            self.ib.disconnect()
            logger.success("Disconnected from IB Gateway.")
        else:
            logger.info("IB Gateway was not connected.")

    def _start_reconnect_loop(self):
        """Starts the reconnection loop if it is not already running."""
        if not self._reconnecting:
            self._reconnect_task = asyncio.create_task(self._reconnect_loop())

    async def _reconnect_loop(self):
        """Asynchronous loop that retries connection with backoff."""
        self._reconnecting = True
        delay = 5
        logger.info("Initiating automatic reconnection loop...")
        
        while not self.ib.isConnected():
            logger.warning(f"Reconnecting in {delay} seconds...")
            try:
                await asyncio.sleep(delay)
                # Cleanup connection states before retrying
                if self.ib.client.isConnected():
                    self.ib.disconnect()
                    
                readonly = getattr(settings, "READ_ONLY_API", False)
                await self.ib.connectAsync(self.host, self.port, clientId=self.client_id, readonly=readonly)
                self.ib.reqMarketDataType(1)  # Request LIVE real-time market data
                logger.success("Reconnected to IB Gateway successfully and requested LIVE market data (type=1).")
                break
            except asyncio.CancelledError:
                logger.info("Reconnection loop cancelled.")
                break
            except Exception as e:
                logger.error(f"Reconnection attempt failed: {e}")
                delay = min(delay * 2, 60)  # Exponential backoff capped at 60 seconds
                
        self._reconnecting = False

    def _on_connected(self):
        """Callback invoked when IB connects."""
        logger.success("Connection Manager: Connected event received.")
        self.connected_event.set()

    def _on_disconnected(self):
        """Callback invoked when IB disconnects."""
        logger.warning("Connection Manager: Disconnected event received.")
        self.connected_event.clear()
        self._start_reconnect_loop()

    def _on_error(self, reqId: int, errorCode: int, errorString: str, contract: object):
        """Callback invoked when IB Gateway returns an error."""
        # 2104, 2106, 2158 are informational status updates regarding connections/market data
        if errorCode in [2104, 2106, 2158]:
            logger.debug(f"IB Info [{errorCode}]: {errorString}")
        else:
            logger.error(f"IB Error [{errorCode}] (Request ID: {reqId}): {errorString}")
            if contract:
                logger.error(f"Failed Contract details: {contract}")
            
            # Fallback to delayed-frozen market data if live data is not subscribed
            if errorCode in [354, 10167, 10090]:
                logger.warning(f"Market data subscription missing (Error {errorCode}). Falling back to delayed-frozen market data (type 4)...")
                try:
                    self.ib.reqMarketDataType(4)
                except Exception as e:
                    logger.error(f"Failed to switch market data type: {e}")
