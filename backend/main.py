import os
import sys
import asyncio
import time
import random
import urllib.request
import json
import math
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

# Add project root to sys.path to resolve imports from src and config
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.connection_manager import ConnectionManager
from src.account_service import AccountService
from src.historical_data_service import HistoricalDataService
from src.market_data_service import MarketDataService
from ib_insync import Forex, Stock, Index, Future, util
import pandas as pd

# Database and Queue integrations
from src.db.clickhouse_client import ch_manager
from src.queue.kafka_producer import kafka_producer
from src.workers.subscription_worker import SubscriptionWorker
from src.workers.tick_ingestion_worker import TickIngestionWorker
from src.auth.router import router as auth_router
from src.market.router import router as market_router
from config import settings

# Patch asyncio to work with existing uvicorn event loops
util.patchAsyncio()

# Global service references
conn: ConnectionManager = None
account_service: AccountService = None
hist_service: HistoricalDataService = None
market_data_service: MarketDataService = None
sub_worker: SubscriptionWorker = None
tick_worker: TickIngestionWorker = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manages the startup and shutdown lifecycles of the connection to IB Gateway, ClickHouse, and Kafka."""
    global conn, account_service, hist_service, market_data_service, sub_worker, tick_worker
    
    # 1. Initialize ClickHouse Schema
    try:
        ch_manager.initialize_schema()
    except Exception as e:
        logger.critical(f"ClickHouse initialization failed: {e}")
        
    # 2. Initialize Kafka Producer
    try:
        kafka_producer.initialize()
    except Exception as e:
        logger.error(f"Kafka Producer initialization failed: {e}")

    logger.info("Initializing connection to IB Gateway...")
    
    # Bind Uvicorn's active running loop to the thread context
    loop = asyncio.get_running_loop()
    asyncio.set_event_loop(loop)
    
    conn = ConnectionManager()
    connected = await conn.connect()
    if not connected:
        logger.critical("FastAPI startup: Could not establish connection to IB Gateway.")
    else:
        logger.success("FastAPI startup: Successfully connected to IB Gateway.")
        
    account_service = AccountService(conn.ib)
    hist_service = HistoricalDataService(conn.ib)
    
    # Initialize and subscribe market data service
    market_data_service = MarketDataService(conn.ib)
    if connected:
        await market_data_service.initialize_subscriptions()

    async def _ib_market_data_watchdog():
        """IB Gateway often becomes ready after the backend starts; (re)subscribe on connect."""
        while True:
            await conn.connected_event.wait()
            try:
                if market_data_service and conn.ib.isConnected():
                    await market_data_service.ensure_subscriptions()
            except Exception as e:
                logger.error(f"Failed to ensure market data subscriptions: {e}")
            while conn.ib.isConnected():
                await asyncio.sleep(2)

    asyncio.create_task(_ib_market_data_watchdog())
    
    # 3. Start Background Event Consumers
    try:
        sub_worker = SubscriptionWorker(market_data_service)
        sub_worker.start()
        
        tick_worker = TickIngestionWorker()
        tick_worker.start()
        logger.success("Started background subscription and tick ingestion workers.")
    except Exception as e:
        logger.error(f"Failed to start background workers: {e}")

    yield
    
    logger.info("Cleaning up connections...")
    if sub_worker:
        sub_worker.stop()
    if tick_worker:
        tick_worker.stop()
    if kafka_producer:
        kafka_producer.flush()
    if market_data_service:
        market_data_service.stop()
    if conn:
        conn.disconnect()
    logger.success("Cleanup completed successfully.")

app = FastAPI(
    title="Trade Analytics API Gateway",
    description="REST and WebSocket API for streaming and analyzing Interactive Brokers market data",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend visualizer
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router)
app.include_router(market_router)


@app.get("/api/stats/today-ticks")
async def get_today_ticks_count():
    """Global tick count for today (ET) — same for all users."""
    try:
        client = ch_manager.get_client()
        result = client.query(
            f"""
            SELECT count() AS cnt
            FROM {settings.CLICKHOUSE_DB}.raw_ticks
            WHERE toDate(ts, 'America/New_York') = toDate(now('America/New_York'))
            """
        )
        count = int(result.result_rows[0][0]) if result.result_rows else 0
        return {
            "count": count,
            "timezone": "America/New_York",
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        }
    except Exception as e:
        logger.error(f"Error fetching today ticks count: {e}")
        return {"count": 0, "error": str(e)}

@app.get("/api/status")
async def get_status():
    """Returns the current connection status to the Gateway."""
    is_connected = conn.ib.isConnected() if conn else False
    return {
        "connected": is_connected,
        "host": conn.host if conn else None,
        "port": conn.port if conn else None,
        "client_id": conn.client_id if conn else None
    }

@app.get("/api/account")
async def get_account():
    """Retrieves account summary information (buying power, cash balance, equity)."""
    if not conn or not conn.ib.isConnected():
        return {"error": "Not connected to IB Gateway", "connected": False}
    try:
        summary = account_service.get_structured_summary()
        # Flatten for the frontend structure
        flat = {
            "NetLiquidation": summary.get("net_liquidation", {}).get("value", 0),
            "TotalCashValue": summary.get("total_cash_value", {}).get("value", 0),
            "BuyingPower": summary.get("buying_power", {}).get("value", 0),
            "Currency": summary.get("net_liquidation", {}).get("currency", "USD")
        }
        return flat
    except Exception as e:
        logger.error(f"Error fetching account summary: {e}")
        return {"error": str(e)}

@app.get("/api/user")
async def get_user_info():
    """Retrieves user profile and account details."""
    if not conn or not conn.ib.isConnected():
        return {"error": "Not connected to IB Gateway"}
    try:
        accounts = conn.ib.managedAccounts()
        account_id = accounts[0] if accounts else "N/A"
        
        # Try to find AccountType from accountValues
        account_type = "INDIVIDUAL"
        for val in conn.ib.accountValues():
            if val.tag == "AccountType":
                account_type = val.value
                break
                
        return {
            "traderName": os.getenv("TWS_USERID", "Quant Trader"),
            "accountId": account_id,
            "accountType": account_type,
            "tradingMode": os.getenv("TRADING_MODE", "paper").upper(),
            "clientId": conn.client_id
        }
    except Exception as e:
        logger.error(f"Error fetching user info: {e}")
        return {"error": str(e)}

TIMEFRAME_MAPPING = {
    "1s": ("1800 S", "1 secs"),
    "5s": ("3600 S", "5 secs"),
    "1m": ("1 D", "1 min"),
    "5m": ("5 D", "5 mins"),
    "1d": ("1 Y", "1 day"),
}

@app.get("/api/candles")
async def get_candles(symbol: str = "AAPL", timeframe: str = "1m"):
    """Retrieves historical candle data for the chart."""
    if not conn or not conn.ib.isConnected():
        return {"error": "Not connected to IB Gateway", "connected": False}
        
    try:
        # Resolve contract details
        if len(symbol) == 6:
            contract = Forex(symbol)
            what_to_show = "MIDPOINT"
        elif symbol == "SPX":
            contract = Index("SPX", "CBOE", "USD")
            what_to_show = "TRADES"
        else:
            contract = Stock(symbol, "SMART", "USD")
            what_to_show = "TRADES"
            
        qualified = await conn.ib.qualifyContractsAsync(contract)
        if not qualified:
            return {"error": f"Symbol qualification failed: {symbol}"}
        contract = qualified[0]
        
        # Get duration and bar size mapping
        tf_cfg = TIMEFRAME_MAPPING.get(timeframe.lower())
        if not tf_cfg:
            return {"error": f"Unsupported timeframe: {timeframe}"}
            
        duration, bar_size = tf_cfg
        
        # Request historical data
        df = await hist_service.get_historical_bars(
            contract=contract,
            duration=duration,
            bar_size=bar_size,
            what_to_show=what_to_show
        )
        
        if df.empty:
            return []
            
        # Format the list of candles for lightweight-charts
        candles = []
        for _, row in df.iterrows():
            dt = row["datetime"]
            
            # Convert to timezone-aware UTC if not set
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            ts = int(dt.timestamp())
                
            candles.append({
                "time": ts,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]) if "volume" in row else 0
            })
            
        return candles
    except Exception as e:
        logger.error(f"Error fetching historical candles: {e}")
        return {"error": str(e)}

@app.get("/api/market-hours")
async def get_market_hours():
    """Returns current US market status based on Eastern Time."""
    now_utc = datetime.now(timezone.utc)
    
    # Determine if we're in EDT (approx Mar-Nov) or EST
    month = now_utc.month
    is_edt = 3 <= month <= 11
    et_offset = timedelta(hours=-4) if is_edt else timedelta(hours=-5)
    now_et = now_utc + et_offset
    
    weekday = now_et.weekday()  # 0=Mon, 6=Sun
    hour = now_et.hour
    minute = now_et.minute
    total_minutes = hour * 60 + minute
    
    # Market phases (in ET minutes from midnight)
    PRE_MARKET_START = 4 * 60        # 04:00 ET
    REGULAR_OPEN     = 9 * 60 + 30   # 09:30 ET
    REGULAR_CLOSE    = 16 * 60       # 16:00 ET
    AFTER_HOURS_END  = 20 * 60       # 20:00 ET
    
    is_weekday = weekday < 5
    
    if not is_weekday:
        phase, phase_label, is_open = "CLOSED", "Weekend — Market Closed", False
    elif total_minutes < PRE_MARKET_START:
        phase, phase_label, is_open = "CLOSED", "Overnight — Market Closed", False
    elif total_minutes < REGULAR_OPEN:
        phase, phase_label, is_open = "PRE_MARKET", "Pre-Market Trading (4:00–9:30 ET)", True
    elif total_minutes < REGULAR_CLOSE:
        phase, phase_label, is_open = "REGULAR", "Regular Session OPEN (9:30–16:00 ET)", True
    elif total_minutes < AFTER_HOURS_END:
        phase, phase_label, is_open = "AFTER_HOURS", "After-Hours Trading (16:00–20:00 ET)", True
    else:
        phase, phase_label, is_open = "CLOSED", "After-Hours Ended — Market Closed", False
    
    if phase == "CLOSED":
        if not is_weekday:
            days_to_monday = (7 - weekday) % 7 or 7
            next_open_mins = days_to_monday * 24 * 60 - total_minutes + REGULAR_OPEN
        elif total_minutes < PRE_MARKET_START:
            next_open_mins = REGULAR_OPEN - total_minutes
        else:
            next_open_mins = (24 * 60 - total_minutes) + REGULAR_OPEN
            if weekday == 4:
                next_open_mins += 2 * 24 * 60
        mins_to_open = int(next_open_mins)
    else:
        mins_to_open = None
    
    mins_to_close = int(REGULAR_CLOSE - total_minutes) if phase == "REGULAR" else None
    
    return {
        "phase": phase,
        "phaseLabel": phase_label,
        "isOpen": is_open,
        "isRegularSession": phase == "REGULAR",
        "currentET": now_et.strftime("%Y-%m-%dT%H:%M:%S"),
        "currentUTC": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dayOfWeek": now_et.strftime("%A"),
        "minsToClose": mins_to_close,
        "minsToOpen": mins_to_open,
        "ibMarketDataType": 1,
        "ibDataTypeLabel": "LIVE"
    }

@app.post("/api/log")
async def client_log(data: dict):
    """Logs client-side frontend errors to the backend console."""
    logger.error(f"====== CLIENT-SIDE ERROR ======\nMessage: {data.get('message')}\nStack: {data.get('stack')}\n===============================")
    return {"status": "logged"}

@app.get("/api/instruments/search")
async def search_instrument(symbol: str = Query(...), sec_type: str = Query("STK")):
    """Searches and qualifies an instrument on Interactive Brokers."""
    if not conn or not conn.ib.isConnected():
        return {"error": "Not connected to IB Gateway"}
    try:
        sec_type_upper = sec_type.upper()
        # Clean symbol to handle futures (e.g. /ES -> ES)
        clean_symbol = symbol.lstrip('/')
        
        if sec_type_upper == "FUT":
            # standard futures, use common defaults or CME/USD
            contract = Future(clean_symbol, exchange="CME", currency="USD")
        elif sec_type_upper == "IND":
            contract = Index(clean_symbol, "CBOE", "USD")
        elif sec_type_upper == "CASH": # Forex
            contract = Forex(clean_symbol)
        else: # STK
            contract = Stock(clean_symbol, "SMART", "USD")
            
        qualified = await conn.ib.qualifyContractsAsync(contract)
        if not qualified:
            return {"error": f"Symbol qualification failed: {symbol}"}
        
        contract = qualified[0]
        # Request contract details to get the company/contract long name
        details = await conn.ib.reqContractDetailsAsync(contract)
        long_name = details[0].longName if details else clean_symbol
        
        return {
            "symbol": symbol.upper(),
            "conId": contract.conId,
            "exchange": contract.exchange,
            "secType": contract.secType,
            "currency": contract.currency,
            "name": long_name,
            "primaryExchange": getattr(contract, "primaryExchange", "N/A"),
            "tradingClass": getattr(contract, "tradingClass", "N/A")
        }
    except Exception as e:
        logger.error(f"Error qualifying contract: {e}")
        return {"error": str(e)}

@app.websocket("/api/ws/ticks")
async def websocket_ticks(websocket: WebSocket, symbols: str = "AAPL"):
    """WebSocket stream for real-time bid/ask tick data from MarketDataService for multiple comma-separated symbols."""
    await websocket.accept()
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    logger.info(f"WebSocket client connected to ticks stream for symbols: {symbol_list}")
    
    if not market_data_service:
        await websocket.send_json({"error": "MarketDataService not initialized"})
        await websocket.close()
        return
        
    for sym in symbol_list:
        market_data_service.register_websocket(sym, websocket)
        
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected from ticks for symbols: {symbol_list}")
    except Exception as e:
        logger.error(f"Error in ticks WebSocket: {e}")
    finally:
        for sym in symbol_list:
            market_data_service.unregister_websocket(sym, websocket)

@app.websocket("/api/ws/bars")
async def websocket_bars(websocket: WebSocket, symbol: str = "EURUSD"):
    """WebSocket stream for real-time 5-second bars."""
    await websocket.accept()
    logger.info(f"WebSocket client connected to 5s bars stream for: {symbol}")
    
    queue = asyncio.Queue()
    
    try:
        # Resolve contract details
        if len(symbol) == 6:
            contract = Forex(symbol)
            bar_type = "MIDPOINT"
        elif symbol == "SPX":
            contract = Index("SPX", "CBOE", "USD")
            bar_type = "TRADES"
        else:
            contract = Stock(symbol, "SMART", "USD")
            bar_type = "TRADES"
            
        qualified = await conn.ib.qualifyContractsAsync(contract)
        if not qualified:
            await websocket.send_json({"error": f"Symbol qualification failed: {symbol}"})
            await websocket.close()
            return
        contract = qualified[0]
        
        # Define real-time bars callback
        def on_realtime_bar(bars, has_new_bar):
            if has_new_bar:
                latest = bars[-1]
                try:
                    queue.put_nowait({
                        "time": latest.time.isoformat() if latest.time else "",
                        "open": latest.open_,
                        "high": latest.high,
                        "low": latest.low,
                        "close": latest.close,
                        "volume": latest.volume
                    })
                except Exception:
                    pass

        # Request real-time bars stream
        rt_bars = conn.ib.reqRealTimeBars(contract, 5, bar_type, False)
        rt_bars.updateEvent += on_realtime_bar
        
        # Forward updates from queue to WebSocket
        while True:
            data = await queue.get()
            await websocket.send_json(data)
            
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected from bars: {symbol}")
    except Exception as e:
        logger.error(f"Error in bars WebSocket stream: {e}")
    finally:
        if conn and conn.ib.isConnected() and 'rt_bars' in locals():
            rt_bars.updateEvent -= on_realtime_bar
            conn.ib.cancelRealTimeBars(rt_bars)
