import asyncio
from typing import Dict, List
from loguru import logger
from ib_insync import IB, Contract

class SubscriptionManager:
    """Manages active market data subscriptions, preventing duplicates and recovering them on reconnect."""
    
    def __init__(self, ib: IB):
        self.ib = ib
        self._subscriptions: Dict[str, Contract] = {}
        
        # Register reconnection handler
        self.ib.connectedEvent += self._on_connected

    def subscribe(self, contract: Contract) -> bool:
        """Subscribes to live market data for a qualified contract.
        
        Prevents duplicate subscriptions.
        """
        symbol = contract.symbol
        if symbol in self._subscriptions:
            logger.info(f"Already subscribed to market data for symbol: {symbol}")
            return True
            
        logger.info(f"Subscribing to market data for symbol: {symbol} (conId: {contract.conId})")
        try:
            self.ib.reqMktData(contract, genericTickList="", snapshot=False, regulatorySnapshot=False)
            self._subscriptions[symbol] = contract
            logger.success(f"Successfully requested market data for: {symbol}")
            return True
        except Exception as e:
            logger.error(f"Failed to subscribe to market data for {symbol}: {e}")
            return False

    def unsubscribe(self, symbol: str) -> bool:
        """Cancels market data subscription for a symbol."""
        if symbol not in self._subscriptions:
            logger.warning(f"No active subscription found for symbol: {symbol}")
            return False
            
        contract = self._subscriptions[symbol]
        logger.info(f"Cancelling market data subscription for symbol: {symbol}")
        try:
            self.ib.cancelMktData(contract)
            del self._subscriptions[symbol]
            logger.success(f"Successfully cancelled market data for: {symbol}")
            return True
        except Exception as e:
            logger.error(f"Failed to cancel subscription for {symbol}: {e}")
            return False

    def get_active_subscriptions(self) -> List[str]:
        """Returns a list of all currently active symbol subscriptions."""
        return list(self._subscriptions.keys())

    def _on_connected(self):
        """Callback invoked automatically on reconnection to restore subscriptions."""
        if self._subscriptions:
            logger.info("Reconnection detected. Restoring active market data subscriptions...")
            # Schedule recovery inside the running event loop
            asyncio.create_task(self._recover_subscriptions())

    async def _recover_subscriptions(self):
        """Asynchronously re-requests market data for all registered contracts."""
        for symbol, contract in self._subscriptions.items():
            logger.info(f"Restoring subscription: {symbol}")
            try:
                # Slight pacing delay between requests on recovery
                await asyncio.sleep(0.1)
                self.ib.reqMktData(contract, genericTickList="", snapshot=False, regulatorySnapshot=False)
                logger.success(f"Subscription restored: {symbol}")
            except Exception as e:
                logger.error(f"Error restoring subscription for {symbol}: {e}")
