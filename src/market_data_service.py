from ib_insync import *
import asyncio
from datetime import datetime, timezone
from typing import Dict, Set
from loguru import logger
import math
from config import settings
from src.db.clickhouse_client import ch_manager

class MarketDataService:
    """Streams live market data to Kafka; IB subscriptions are independent of WebSocket clients."""

    def __init__(self, ib: IB):
        self.ib = ib
        self.websockets: Dict[str, Set] = {}
        self.cache: Dict[str, dict] = {}
        self.contracts: Dict[str, Contract] = {}
        self.tickers: Dict[str, Ticker] = {}
        self.always_stream: Set[str] = set()
        self.active = False
        self._loop = None

    def _cache_for(self, symbol: str) -> dict:
        if symbol not in self.cache:
            self.cache[symbol] = {"last": None, "bid": None, "ask": None, "volume": None}
        return self.cache[symbol]

    async def _load_stream_symbols_from_db(self):
        """Merge active instruments from ClickHouse into the always-on stream set."""
        try:
            client = ch_manager.get_client()
            rows = client.query(f"""
                SELECT DISTINCT symbol
                FROM {settings.CLICKHOUSE_DB}.instruments FINAL
                WHERE is_active = 1
            """).result_rows
            for (symbol,) in rows:
                self.always_stream.add(symbol.upper())
            if rows:
                logger.info(f"Loaded {len(rows)} active instrument(s) from ClickHouse")
        except Exception as e:
            logger.error(f"Failed to load instruments from ClickHouse: {e}")

    async def ensure_autonomous_streaming(self, force_resubscribe: bool = False):
        """Start or restore IB subscriptions for all production stream symbols."""
        for symbol in settings.DEFAULT_STREAM_SYMBOLS:
            self.always_stream.add(symbol.upper())
        await self._load_stream_symbols_from_db()

        if not self.ib.isConnected():
            logger.warning(
                f"IB not connected; {len(self.always_stream)} symbol(s) queued for streaming on reconnect"
            )
            return

        self._loop = asyncio.get_event_loop()
        self.active = True

        if force_resubscribe:
            self._clear_ib_subscriptions()

        for symbol in sorted(self.always_stream):
            await self._subscribe_to_symbol(symbol)

        logger.success(
            f"Autonomous streaming active for {len(self.always_stream)} symbol(s): "
            f"{sorted(self.always_stream)}"
        )

    async def ensure_subscriptions(self):
        """Alias used by reconnect watchdog."""
        await self.ensure_autonomous_streaming(force_resubscribe=True)

    def _clear_ib_subscriptions(self):
        """Drop local IB handles after gateway disconnect so symbols can be re-requested."""
        for symbol, ticker in list(self.tickers.items()):
            try:
                ticker.updateEvent.clear()
                if symbol in self.contracts:
                    self.ib.cancelMktData(self.contracts[symbol])
            except Exception:
                pass
        self.tickers.clear()
        self.contracts.clear()

    def stop(self):
        if not self.active:
            return
        logger.info("Stopping MarketDataService...")
        self._clear_ib_subscriptions()
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
            elif symbol == "DJI":
                contract = Index("DJI", "CBOE", "USD")
            else:
                contract = Stock(symbol, "SMART", "USD")

            qualified = await self.ib.qualifyContractsAsync(contract)
            if qualified:
                self.contracts[symbol] = qualified[0]
                ticker = self.ib.reqMktData(qualified[0], "", False, False)
                ticker.updateEvent += lambda t, s=symbol: self._on_ticker_update(s, t)
                self.tickers[symbol] = ticker
                self._cache_for(symbol)
                logger.success(f"IB market data subscription active for: {symbol}")
            else:
                logger.error(f"Failed to qualify contract for symbol: {symbol}")
        except Exception as e:
            logger.error(f"Error subscribing to {symbol}: {e}")

    def request_streaming(self, symbol: str):
        """Add a symbol to the always-on pipeline (e.g. user subscribe event)."""
        symbol = symbol.upper()
        self.always_stream.add(symbol)
        self._cache_for(symbol)
        if self._loop and self.ib.isConnected():
            asyncio.run_coroutine_threadsafe(self._subscribe_to_symbol(symbol), self._loop)

    def register_websocket(self, symbol: str, websocket):
        symbol = symbol.upper()
        if symbol not in self.websockets:
            self.websockets[symbol] = set()
        if websocket is not None:
            self.websockets[symbol].add(websocket)
        self.request_streaming(symbol)
        logger.info(f"Registered WebSocket client for {symbol}")

    def unregister_websocket(self, symbol: str, websocket):
        """Remove a UI client only — never tears down production IB streaming."""
        if symbol not in self.websockets or websocket not in self.websockets[symbol]:
            return
        self.websockets[symbol].remove(websocket)
        logger.info(f"Unregistered WebSocket client for {symbol}")
        if not self.websockets[symbol]:
            del self.websockets[symbol]

    def _on_ticker_update(self, symbol: str, ticker: Ticker):
        """Fires on every individual IB tick — no batching, zero delay."""
        logger.debug(
            f"Tick update received for {symbol}: last={ticker.last}, "
            f"bid={ticker.bid}, ask={ticker.ask}, close={ticker.close}"
        )
        if symbol not in self.contracts:
            return

        loop = self._loop

        def _safe_float(val):
            if val is None:
                return None
            try:
                return None if math.isnan(val) else float(val)
            except Exception:
                return None

        new_last = _safe_float(ticker.last)
        new_bid = _safe_float(ticker.bid)
        new_ask = _safe_float(ticker.ask)
        new_close = _safe_float(ticker.close)

        cache = self._cache_for(symbol)

        if (
            new_last == cache.get("last")
            and new_bid == cache.get("bid")
            and new_ask == cache.get("ask")
        ):
            return

        if new_last is not None:
            cache["last"] = new_last
        if new_bid is not None:
            cache["bid"] = new_bid
        if new_ask is not None:
            cache["ask"] = new_ask
        if new_close is not None:
            cache["close"] = new_close

        vol = ticker.volume
        if vol is not None:
            try:
                if not math.isnan(vol):
                    cache["volume"] = int(vol)
            except Exception:
                pass

        ts = ticker.time
        if ts:
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            ts_str = (
                ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
                + f"{ts.microsecond // 1000:03d}Z"
            )
        else:
            now = datetime.now(timezone.utc)
            ts_str = (
                now.strftime("%Y-%m-%dT%H:%M:%S.")
                + f"{now.microsecond // 1000:03d}Z"
            )

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
            bid_qty_1 = _safe_int(ticker.bidSize)
            ask_qty_1 = _safe_int(ticker.askSize)
            open_price = _safe_float(ticker.open) or 0.0
            high_price = _safe_float(ticker.high) or 0.0
            low_price = _safe_float(ticker.low) or 0.0
            close_price = cache.get("close") or 0.0
            ltp = cache.get("last") or 0.0
            volume = cache.get("volume") or 0
            oi = _safe_int(ticker.callOpenInterest or ticker.putOpenInterest or 0)
            change = round(ltp - close_price, 4) if ltp and close_price else 0.0

            kafka_msg = {
                "instrument_token": con_id,
                "symbol": symbol,
                "exchange": exchange,
                "ltp": ltp,
                "volume": volume,
                "buy_quantity": bid_qty_1,
                "sell_quantity": ask_qty_1,
                "open": open_price,
                "high": high_price,
                "low": low_price,
                "close": close_price,
                "change": change,
                "oi": oi,
                "bid_price_1": bid_price_1,
                "bid_qty_1": bid_qty_1,
                "ask_price_1": ask_price_1,
                "ask_qty_1": ask_qty_1,
                "bid_price_2": 0,
                "bid_qty_2": 0,
                "bid_price_3": 0,
                "bid_qty_3": 0,
                "bid_price_4": 0,
                "bid_qty_4": 0,
                "bid_price_5": 0,
                "bid_qty_5": 0,
                "ask_price_2": 0,
                "ask_qty_2": 0,
                "ask_price_3": 0,
                "ask_qty_3": 0,
                "ask_price_4": 0,
                "ask_qty_4": 0,
                "ask_price_5": 0,
                "ask_qty_5": 0,
                "ts": ts_str,
            }
            from src.queue.kafka_producer import kafka_producer

            kafka_producer.publish("market-ticks", str(con_id), kafka_msg)
        except Exception as ke:
            logger.error(f"Failed to publish tick to Kafka: {ke}")

        msg = {
            "symbol": symbol,
            "last": cache.get("last"),
            "bid": cache.get("bid"),
            "ask": cache.get("ask"),
            "close": cache.get("close"),
            "volume": cache.get("volume"),
            "timestamp": ts_str,
        }

        ws_clients = self.websockets.get(symbol, set())
        if not loop or not ws_clients:
            return

        for ws in list(ws_clients):
            if ws is not None:
                try:
                    asyncio.run_coroutine_threadsafe(ws.send_json(msg), loop)
                except Exception as e:
                    logger.warning(f"Failed to broadcast tick to WebSocket: {e}")
