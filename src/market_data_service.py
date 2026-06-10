from ib_insync import *
import asyncio
from datetime import datetime, timezone
from typing import Dict, Set
from loguru import logger
import math

class MarketDataService:
    """Streams live, event-driven market data using per-ticker updateEvent for zero-delay ticks."""
    
    def __init__(self, ib: IB):
        self.ib = ib
        self.websockets: Dict[str, Set] = {}
        self.cache: Dict[str, dict] = {}
        self.contracts: Dict[str, Contract] = {}
        self.tickers: Dict[str, Ticker] = {}   # store ticker objects for event binding
        self.active = False
        self._loop = None

    async def ensure_subscriptions(self):
        """Activate streaming and subscribe all registered symbols (safe after IB reconnect)."""
        if not self.ib.isConnected():
            return
        if not self.active:
            await self.initialize_subscriptions()
        for symbol in list(self.websockets.keys()):
            await self._subscribe_to_symbol(symbol)

    async def initialize_subscriptions(self):
        """Qualifies contracts and binds per-ticker updateEvent for max-speed delivery."""
        if self.active:
            return

        logger.info("Initializing MarketDataService subscriptions...")
        self._loop = asyncio.get_event_loop()
        self.active = True

        for symbol in ["AAPL", "MSFT", "NVDA", "TSLA"]:
            self.websockets[symbol] = set()
            self.cache[symbol] = {"last": None, "bid": None, "ask": None, "volume": None}
            contract = Stock(symbol, "SMART", "USD")
            qualified = await self.ib.qualifyContractsAsync(contract)
            if qualified:
                self.contracts[symbol] = qualified[0]
                ticker = self.ib.reqMktData(qualified[0], "", False, False)
                # Per-ticker event fires on EVERY individual tick — much faster than pendingTickersEvent
                ticker.updateEvent += lambda t, s=symbol: self._on_ticker_update(s, t)
                self.tickers[symbol] = ticker
                logger.success(f"Subscribed to IB per-ticker updateEvent for {symbol}")
            else:
                logger.error(f"Failed to qualify contract for {symbol}")

    def stop(self):
        if not self.active:
            return
        logger.info("Stopping MarketDataService...")
        for symbol, ticker in list(self.tickers.items()):
            try:
                ticker.updateEvent.clear()
                self.ib.cancelMktData(self.contracts[symbol])
            except Exception:
                pass
        self.tickers.clear()
        self.active = False
        logger.success("MarketDataService stopped.")

    async def _subscribe_to_symbol(self, symbol: str):
        if symbol in self.contracts:
            return
        try:
            if len(symbol) == 6:
                contract = Forex(symbol)
            elif symbol == "SPX":
                contract = Index("SPX", "CBOE", "USD")
            else:
                contract = Stock(symbol, "SMART", "USD")

            qualified = await self.ib.qualifyContractsAsync(contract)
            if qualified:
                self.contracts[symbol] = qualified[0]
                ticker = self.ib.reqMktData(qualified[0], "", False, False)
                ticker.updateEvent += lambda t, s=symbol: self._on_ticker_update(s, t)
                self.tickers[symbol] = ticker
                logger.success(f"Dynamic per-ticker subscription active for: {symbol}")
            else:
                logger.error(f"Failed to qualify contract for dynamic symbol: {symbol}")
        except Exception as e:
            logger.error(f"Error subscribing to {symbol}: {e}")

    def register_websocket(self, symbol: str, websocket):
        if symbol not in self.websockets:
            self.websockets[symbol] = set()
            self.cache[symbol] = {"last": None, "bid": None, "ask": None, "volume": None}
            if self.ib.isConnected():
                if not self.active:
                    asyncio.create_task(self.ensure_subscriptions())
                else:
                    asyncio.create_task(self._subscribe_to_symbol(symbol))
        self.websockets[symbol].add(websocket)
        logger.info(f"Registered WebSocket client for {symbol}")

    def unregister_websocket(self, symbol: str, websocket):
        if symbol in self.websockets and websocket in self.websockets[symbol]:
            self.websockets[symbol].remove(websocket)
            logger.info(f"Unregistered WebSocket client for {symbol}")
            if not self.websockets[symbol]:
                del self.websockets[symbol]
                if symbol in self.tickers:
                    try:
                        self.tickers[symbol].updateEvent.clear()
                    except Exception:
                        pass
                    del self.tickers[symbol]
                if symbol in self.contracts:
                    try:
                        self.ib.cancelMktData(self.contracts[symbol])
                    except Exception as e:
                        logger.error(f"Failed to cancel subscription for {symbol}: {e}")
                    del self.contracts[symbol]
                if symbol in self.cache:
                    del self.cache[symbol]

    def _on_ticker_update(self, symbol: str, ticker: Ticker):
        """Fires on every individual IB tick — no batching, zero delay."""
        logger.debug(f"Tick update received for {symbol}: last={ticker.last}, bid={ticker.bid}, ask={ticker.ask}, close={ticker.close}")
        if symbol not in self.websockets or not self.websockets[symbol]:
            return

        loop = self._loop
        if not loop:
            return

        def _safe_float(val):
            if val is None:
                return None
            try:
                return None if math.isnan(val) else float(val)
            except Exception:
                return None

        new_last = _safe_float(ticker.last)
        new_bid  = _safe_float(ticker.bid)
        new_ask  = _safe_float(ticker.ask)
        new_close = _safe_float(ticker.close)

        cache = self.cache.get(symbol, {})

        # Only broadcast if a price field actually changed (ignore size-only updates)
        if (new_last == cache.get("last") and
                new_bid == cache.get("bid") and
                new_ask == cache.get("ask")):
            return

        if new_last is not None: cache["last"] = new_last
        if new_bid  is not None: cache["bid"]  = new_bid
        if new_ask  is not None: cache["ask"]  = new_ask
        if new_close is not None: cache["close"] = new_close

        vol = ticker.volume
        if vol is not None:
            try:
                if not math.isnan(vol):
                    cache["volume"] = int(vol)
            except Exception:
                pass

        # Use IB's precise tick timestamp (ms precision)
        ts = ticker.time
        if ts:
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            ts_str = ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{ts.microsecond // 1000:03d}Z"
        else:
            now = datetime.now(timezone.utc)
            ts_str = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"

        # Publish to Kafka market-ticks with full depth-of-book schema
        try:
            contract = self.contracts.get(symbol)
            con_id = contract.conId if contract else 0
            exchange = contract.exchange if contract else "SMART"

            def _safe_int(val):
                try:
                    return int(val) if val and not math.isnan(val) else 0
                except Exception:
                    return 0

            bid_price_1 = cache.get("bid") or 0.0
            ask_price_1 = cache.get("ask") or 0.0
            bid_qty_1   = _safe_int(ticker.bidSize)
            ask_qty_1   = _safe_int(ticker.askSize)
            open_price  = _safe_float(ticker.open)  or 0.0
            high_price  = _safe_float(ticker.high)  or 0.0
            low_price   = _safe_float(ticker.low)   or 0.0
            close_price = cache.get("close") or 0.0
            ltp         = cache.get("last")  or 0.0
            volume      = cache.get("volume") or 0
            oi          = _safe_int(ticker.callOpenInterest or ticker.putOpenInterest or 0)
            change      = round(ltp - close_price, 4) if ltp and close_price else 0.0

            kafka_msg = {
                "instrument_token": con_id,
                "symbol":           symbol,
                "exchange":         exchange,
                "ltp":              ltp,
                "volume":           volume,
                "buy_quantity":     bid_qty_1,   # best proxy from standard IB data
                "sell_quantity":    ask_qty_1,
                "open":             open_price,
                "high":             high_price,
                "low":              low_price,
                "close":            close_price,
                "change":           change,
                "oi":               oi,
                # Level 1 depth (real IB data)
                "bid_price_1":      bid_price_1,
                "bid_qty_1":        bid_qty_1,
                "ask_price_1":      ask_price_1,
                "ask_qty_1":        ask_qty_1,
                # Levels 2–5: default 0 (requires separate reqMktDepth subscription)
                "bid_price_2": 0, "bid_qty_2": 0,
                "bid_price_3": 0, "bid_qty_3": 0,
                "bid_price_4": 0, "bid_qty_4": 0,
                "bid_price_5": 0, "bid_qty_5": 0,
                "ask_price_2": 0, "ask_qty_2": 0,
                "ask_price_3": 0, "ask_qty_3": 0,
                "ask_price_4": 0, "ask_qty_4": 0,
                "ask_price_5": 0, "ask_qty_5": 0,
                "ts": ts_str
            }
            from src.queue.kafka_producer import kafka_producer
            kafka_producer.publish("market-ticks", str(con_id), kafka_msg)
        except Exception as ke:
            logger.error(f"Failed to publish tick to Kafka: {ke}")

        msg = {
            "symbol": symbol,
            "last": cache.get("last"),
            "bid":  cache.get("bid"),
            "ask":  cache.get("ask"),
            "close": cache.get("close"),
            "volume": cache.get("volume"),
            "timestamp": ts_str
        }

        for ws in list(self.websockets[symbol]):
            if ws is not None:  # Skip background placeholders (e.g. from subscription worker)
                try:
                    asyncio.run_coroutine_threadsafe(ws.send_json(msg), loop)
                except Exception as e:
                    logger.warning(f"Failed to broadcast tick to WebSocket: {e}")

