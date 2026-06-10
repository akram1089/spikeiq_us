import asyncio
import sys
from loguru import logger
from ib_insync import IB, Forex, util
from src.connection_manager import ConnectionManager
from src.historical_data_service import HistoricalDataService
from src.utils.logger import setup_logger

async def main():
    # Setup logger and reconfigure stdout for Windows unicode support
    if sys.platform == 'win32':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
            
    setup_logger()
    logger.info("Starting IB Market Data Viewer...")
    
    # Initialize connection
    conn = ConnectionManager()
    connected = await conn.connect()
    if not connected:
        logger.error("Failed to connect to IB Gateway.")
        return
        
    ib = conn.ib
    
    try:
        # Define the EUR/USD Forex contract (Free data, active 24/5)
        contract = Forex("EURUSD")
        logger.info("Qualifying EURUSD Forex Contract...")
        qualified = await ib.qualifyContractsAsync(contract)
        if not qualified:
            logger.error("Failed to qualify contract.")
            return
        contract = qualified[0]
        
        # 1. RETRIEVE HISTORICAL OHLCV DATA
        logger.info("=== 1. FETCHING HISTORICAL CANDLES ===")
        hist_service = HistoricalDataService(ib)
        # Fetching 1-minute bars for the last 1 day (using MIDPOINT for Forex)
        df = await hist_service.get_historical_bars(contract, "1 D", "1 min", what_to_show="MIDPOINT")
        if not df.empty:
            print("\n--- Last 10 Historical 1-Minute Candles ---")
            print(df.tail(10).to_string(index=False))
            print("-------------------------------------------\n")
        else:
            logger.warning("No historical data returned.")

        # 2. STREAM LIVE TICK QUOTES
        logger.info("=== 2. STREAMING LIVE BID/ASK QUOTES (10 Seconds) ===")
        print("Listening to tick stream. Press Ctrl+C to stop early...\n")
        
        # Callback for tick updates
        def on_pending_tickers(tickers):
            for ticker in tickers:
                if ticker.contract.conId == contract.conId:
                    bid = ticker.bid if ticker.bid is not None else "N/A"
                    ask = ticker.ask if ticker.ask is not None else "N/A"
                    time_str = ticker.time.strftime("%H:%M:%S") if ticker.time else "N/A"
                    print(f"[TICK] {contract.symbol} | Bid: {bid:<8} | Ask: {ask:<8} | Time: {time_str}")

        ib.pendingTickersEvent += on_pending_tickers
        ib.reqMktData(contract, "", False, False)
        
        await asyncio.sleep(10)
        
        # Cleanup tick streaming
        ib.pendingTickersEvent -= on_pending_tickers
        ib.cancelMktData(contract)
        print("\nStreaming finished.\n")

        # 3. STREAM LIVE 5-SECOND REAL-TIME BARS
        logger.info("=== 3. STREAMING 5-SECOND REAL-TIME BARS (15 Seconds) ===")
        print("Listening to real-time 5-second bar updates...\n")
        
        # Callback for real-time bars
        def on_realtime_bar(bars, has_new_bar):
            if has_new_bar:
                latest_bar = bars[-1]
                print(
                    f"[5s BAR] Time: {latest_bar.time.strftime('%H:%M:%S')} | "
                    f"Open: {latest_bar.open_:<8.5f} | "
                    f"High: {latest_bar.high:<8.5f} | "
                    f"Low: {latest_bar.low:<8.5f} | "
                    f"Close: {latest_bar.close:<8.5f} | "
                    f"Volume: {latest_bar.volume}"
                )

        rt_bars = ib.reqRealTimeBars(contract, 5, "MIDPOINT", False)
        rt_bars.updateEvent += on_realtime_bar
        
        await asyncio.sleep(15)
        
        # Cleanup real-time bars
        rt_bars.updateEvent -= on_realtime_bar
        ib.cancelRealTimeBars(rt_bars)
        print("\nReal-time bar streaming finished.\n")
        
    except Exception as e:
        logger.exception(f"Error viewing market data: {e}")
    finally:
        logger.info("Disconnecting and cleaning up...")
        conn.disconnect()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nExecution stopped by user.")
