import asyncio
from datetime import datetime
from typing import List, Dict
from loguru import logger
from ib_insync import IB, RealTimeBarList
from src.connection_manager import ConnectionManager
from src.contract_service import ContractService
from src.utils.logger import setup_logger

class RealTimeBarService:
    """Manages subscription and event-driven consumption of real-time 5-second bars."""
    
    def __init__(self, ib: IB):
        self.ib = ib
        self._active_subscriptions: Dict[str, RealTimeBarList] = {}

    async def start_bars(self, symbols: List[str]):
        """Resolves contracts and registers subscriptions for real-time bars."""
        contract_service = ContractService(self.ib)
        logger.info(f"Resolving contracts for real-time bars: {symbols}...")
        
        for symbol in symbols:
            if symbol in self._active_subscriptions:
                logger.info(f"Real-time bars already active for: {symbol}")
                continue
                
            contract = await contract_service.get_qualified_contract(symbol)
            if not contract:
                logger.error(f"Cannot request real-time bars for {symbol}: Qualification failed.")
                continue
                
            try:
                # IB only supports 5-second bars for reqRealTimeBars
                # reqRealTimeBars parameters: contract, barSize (must be 5), whatToShow, useRTH
                logger.info(f"Requesting real-time bars for {symbol}...")
                bars = self.ib.reqRealTimeBars(contract, 5, "TRADES", False)
                
                # Bind callback using lambda to preserve symbol context
                bars.updateEvent += lambda b, h, s=symbol: self._on_bar_update(s, b, h)
                
                self._active_subscriptions[symbol] = bars
                logger.success(f"Subscribed to real-time bars for {symbol}")
            except Exception as e:
                logger.error(f"Failed to subscribe to real-time bars for {symbol}: {e}")

    def stop_bars(self):
        """Cancels all active real-time bar subscriptions and cleans up callbacks."""
        logger.info("Stopping real-time bar streams...")
        
        # Make a copy of keys to avoid modification during iteration
        active_symbols = list(self._active_subscriptions.keys())
        for symbol in active_symbols:
            bars = self._active_subscriptions[symbol]
            try:
                # Clear callbacks to avoid memory leaks
                bars.updateEvent.clear()
                self.ib.cancelRealTimeBars(bars)
                logger.success(f"Cancelled real-time bars for: {symbol}")
            except Exception as e:
                logger.error(f"Error cancelling real-time bars for {symbol}: {e}")
                
        self._active_subscriptions.clear()
        logger.info("Graceful shutdown of RealTimeBarService complete.")

    def _on_bar_update(self, symbol: str, bars: RealTimeBarList, has_new_bar: bool):
        """Callback triggered when a real-time bar is updated or completed."""
        if not has_new_bar:
            # We are interested in completed bars only
            return
            
        try:
            latest_bar = bars[-1]
            
            # Extract fields. Note the use of 'open_' to avoid conflicting with python builtin
            open_price = latest_bar.open_
            high = latest_bar.high
            low = latest_bar.low
            close = latest_bar.close
            volume = latest_bar.volume
            
            # Format timestamp
            ts = latest_bar.time
            if isinstance(ts, int):
                # If timestamp is UNIX epoch
                ts_str = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")
            elif isinstance(ts, datetime):
                ts_str = ts.strftime("%Y-%m-%d %H:%M:%S")
            else:
                ts_str = str(ts)
                
            # Print the formatted bar update to the console
            print(
                f"[BAR]  {symbol:<5} | "
                f"O: {open_price:<8.2f} | "
                f"H: {high:<8.2f} | "
                f"L: {low:<8.2f} | "
                f"C: {close:<8.2f} | "
                f"Vol: {int(volume):<6} | "
                f"Time: {ts_str}"
            )
            logger.debug(f"Bar update for {symbol}: O={open_price}, H={high}, L={low}, C={close}, V={volume}")
            
        except IndexError:
            # If bar list is empty
            pass
        except Exception as e:
            logger.error(f"Error handling bar update for {symbol}: {e}")

async def main():
    """Example usage of RealTimeBarService."""
    setup_logger()
    logger.info("Starting RealTimeBarService Test Scenario (Running for 15 seconds)...")
    
    conn = ConnectionManager()
    connected = await conn.connect()
    
    if not connected:
        logger.error("Could not run test scenario. Connection failed.")
        return
        
    service = RealTimeBarService(conn.ib)
    
    try:
        symbols = ["AAPL", "NVDA", "TSLA"]
        await service.start_bars(symbols)
        
        # Run and observe for 15 seconds
        await asyncio.sleep(15)
        
    except Exception as e:
        logger.exception(f"Unexpected error in RealTimeBarService test: {e}")
    finally:
        # Graceful shutdown
        service.stop_bars()
        conn.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
