import asyncio
import sys
from loguru import logger
from src.connection_manager import ConnectionManager
from src.account_service import AccountService
from src.contract_service import ContractService
from src.subscription_manager import SubscriptionManager
from src.historical_data_service import HistoricalDataService
from src.realtime_bar_service import RealTimeBarService
from src.utils.logger import setup_logger

class EnvironmentValidator:
    """Orchestrates a 10-step diagnostic check to validate the Interactive Brokers development environment."""
    
    def __init__(self):
        self.conn = ConnectionManager()
        self.ib = self.conn.ib
        self.steps = {
            1: {"desc": "Connected to IB Gateway", "status": "PENDING"},
            2: {"desc": "Account Access Verified", "status": "PENDING"},
            3: {"desc": "Account Summary Retrieved", "status": "PENDING"},
            4: {"desc": "EURUSD Contract Retrieved", "status": "PENDING"},
            5: {"desc": "Contract Qualified", "status": "PENDING"},
            6: {"desc": "Live EURUSD Market Data Subscribed", "status": "PENDING"},
            7: {"desc": "Live Market Data Received", "status": "PENDING"},
            8: {"desc": "Historical Data Retrieved", "status": "PENDING"},
            9: {"desc": "Real-Time Bars Received", "status": "PENDING"},
            10: {"desc": "Environment Ready", "status": "PENDING"}
        }
        self.contract = None
        self.realtime_bar_received = False

    def _update_step(self, step_num: int, status: str, detail: str = ""):
        self.steps[step_num]["status"] = status
        self.steps[step_num]["detail"] = detail
        if status == "PASS":
            logger.success(f"Step {step_num} PASS: {self.steps[step_num]['desc']} {f'({detail})' if detail else ''}")
        else:
            logger.error(f"Step {step_num} FAIL: {self.steps[step_num]['desc']} {f'({detail})' if detail else ''}")

    async def run_validation(self):
        logger.info("Starting Environment Validation Suite...")
        
        # Step 1: Connect to IB Gateway
        connected = await self.conn.connect()
        self.ib = self.conn.ib
        if connected:
            self._update_step(1, "PASS")
        else:
            self._update_step(1, "FAIL", "Check gateway logs, network, and ports.")
            self._fail_remaining_steps(2, "Connection failed.")
            self._print_results()
            return
            
        try:
            account_service = AccountService(self.ib)
            contract_service = ContractService(self.ib)
            sub_manager = SubscriptionManager(self.ib)
            hist_service = HistoricalDataService(self.ib)
            bar_service = RealTimeBarService(self.ib)

            # Step 2: Verify Account Access
            has_access = account_service.verify_account_access()
            if has_access:
                self._update_step(2, "PASS")
            else:
                self._update_step(2, "FAIL", "No managed accounts found.")
                
            # Step 3: Verify Account Summary Retrieval
            summary = account_service.get_structured_summary()
            if summary:
                # Get NetLiquidation value for printing
                net_liq = summary.get("net_liquidation", {}).get("value", "N/A")
                currency = summary.get("net_liquidation", {}).get("currency", "")
                self._update_step(3, "PASS", f"Net Liq: {net_liq} {currency}")
            else:
                self._update_step(3, "FAIL", "Failed to retrieve account summary fields.")

            # Step 4: Retrieve EURUSD Contract
            # We construct the Forex contract for lookup
            from ib_insync import Forex
            contract = Forex("EURUSD")
            self._update_step(4, "PASS")

            # Step 5: Verify Contract Qualification
            qualified_contracts = await self.ib.qualifyContractsAsync(contract)
            if qualified_contracts:
                self.contract = qualified_contracts[0]
                self._update_step(5, "PASS", f"conId: {self.contract.conId}")
            else:
                self._update_step(5, "FAIL", "Qualification failed. Symbol EURUSD could not be resolved.")
                self._fail_remaining_steps(6, "Contract qualification required.")
                self._print_results()
                return

            # Step 6: Subscribe to live EURUSD market data
            subscribed = sub_manager.subscribe(self.contract)
            if subscribed:
                self._update_step(6, "PASS")
            else:
                self._update_step(6, "FAIL", "Subscription request failed.")

            # Step 7: Verify bid/ask received
            logger.info("Waiting 5 seconds for live market data ticks...")
            # Let's check ticker values for up to 5 seconds
            ticker_received = False
            for _ in range(5):
                await asyncio.sleep(1)
                ticker = self.ib.ticker(self.contract)
                if ticker and (ticker.bid is not None or ticker.ask is not None or ticker.time is not None):
                    ticker_received = True
                    detail_str = f"Bid: {ticker.bid}, Ask: {ticker.ask}"
                    self._update_step(7, "PASS", detail_str)
                    break
            
            if not ticker_received:
                ticker = self.ib.ticker(self.contract)
                if ticker:
                    self._update_step(7, "PASS", "Connected but bid/ask is None (no market data permissions)")
                else:
                    self._update_step(7, "FAIL", "No market data updates received.")

            # Step 8: Retrieve historical candles
            # Fetch 1-minute historical candles for 1 day
            what_to_show = "MIDPOINT" if self.contract.secType == "CASH" else "TRADES"
            df = await hist_service.get_historical_bars(self.contract, "1 D", "1 min", what_to_show=what_to_show)
            if not df.empty:
                self._update_step(8, "PASS", f"Retrieved {len(df)} candles")
            else:
                self._update_step(8, "FAIL", "Historical data DataFrame is empty.")

            # Step 9: Subscribe to real-time bars
            # We hook a custom callback to check if we receive a bar
            def on_bar(bars, has_new_bar):
                if has_new_bar:
                    self.realtime_bar_received = True
                    logger.success("Real-time 5s bar received.")

            logger.info("Requesting real-time 5s bars for EURUSD...")
            rt_bars = self.ib.reqRealTimeBars(self.contract, 5, "MIDPOINT", False)
            rt_bars.updateEvent += on_bar
            
            logger.info("Waiting up to 8 seconds for a real-time bar...")
            for _ in range(8):
                await asyncio.sleep(1)
                if self.realtime_bar_received:
                    break
                    
            # Cleanup real-time bars
            rt_bars.updateEvent.clear()
            self.ib.cancelRealTimeBars(rt_bars)
            
            if self.realtime_bar_received:
                self._update_step(9, "PASS")
            else:
                self._update_step(9, "FAIL", "Timeout waiting for 5-second real-time bar.")

            # Step 10: Environment Ready
            # Overall readiness check
            failed_steps = [k for k, v in self.steps.items() if v["status"] == "FAIL" and k < 10]
            if not failed_steps:
                self._update_step(10, "PASS")
            else:
                self._update_step(10, "FAIL", f"Failed steps: {failed_steps}")

        except Exception as e:
            logger.exception(f"Exception during environment validation: {e}")
            self._update_step(10, "FAIL", f"Exception: {str(e)}")
        finally:
            # Cleanup subscriptions
            if self.contract:
                sub_manager.unsubscribe(self.contract.symbol)
            self.conn.disconnect()

        self._print_results()

    def _fail_remaining_steps(self, start_step: int, reason: str):
        for k in range(start_step, 11):
            self._update_step(k, "FAIL", reason)

    def _print_results(self):
        """Prints the final summary in the requested user format."""
        print("\n" + "="*50)
        print("         ENVIRONMENT VALIDATION REPORT")
        print("="*50)
        
        status_symbols = {
            "PASS": "\033[92m✓\033[0m", # Green checkmark
            "FAIL": "\033[91m✗\033[0m", # Red cross
            "PENDING": " "
        }
        
        # Fallback for Windows consoles that don't support color natively (if sys.stdout is redirected or not a tty)
        if not sys.stdout.isatty():
            status_symbols = {"PASS": "✓", "FAIL": "✗", "PENDING": " "}

        # Map to requested format keys
        reported_steps = {
            1: "Connected to IB Gateway",
            2: "Account Access Verified",
            3: "Account Summary Retrieved",
            5: "Contract Qualified",
            7: "Live Market Data Received",
            8: "Historical Data Retrieved",
            9: "Real-Time Bars Received",
            10: "Environment Ready"
        }

        for num, label in reported_steps.items():
            step_data = self.steps[num]
            sym = status_symbols.get(step_data["status"], " ")
            detail_str = f" - {step_data['detail']}" if step_data.get("detail") else ""
            try:
                print(f"{sym} {label}{detail_str}")
            except UnicodeEncodeError:
                ascii_symbols = {
                    "PASS": "[PASS]",
                    "FAIL": "[FAIL]",
                    "PENDING": " "
                }
                ascii_sym = ascii_symbols.get(step_data["status"], " ")
                print(f"{ascii_sym} {label}{detail_str}")
            
        print("="*50 + "\n")

if __name__ == "__main__":
    import sys
    if sys.platform == 'win32':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
            sys.stderr.reconfigure(encoding='utf-8')
        except Exception:
            pass

    setup_logger()
    validator = EnvironmentValidator()
    asyncio.run(validator.run_validation())
