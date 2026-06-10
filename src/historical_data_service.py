import asyncio
import pandas as pd
from typing import Optional
from loguru import logger
from ib_insync import IB, Contract, util
from src.connection_manager import ConnectionManager
from src.contract_service import ContractService
from src.utils.logger import setup_logger

class HistoricalDataService:
    """Retrieves historical OHLCV data from Interactive Brokers as Pandas DataFrames."""
    
    def __init__(self, ib: IB):
        self.ib = ib

    async def get_historical_bars(
        self, 
        contract: Contract, 
        duration: str, 
        bar_size: str, 
        what_to_show: str = "TRADES", 
        use_rth: bool = True
    ) -> pd.DataFrame:
        """Asynchronously requests historical bar data from the IB API.
        
        Returns a Pandas DataFrame containing: datetime, open, high, low, close, volume.
        """
        symbol = contract.symbol
        logger.info(f"Requesting historical data for {symbol} (Size: {bar_size}, Duration: {duration})...")
        
        last_error = None
        def on_error(reqId, errorCode, errorString, contract_err=None):
            nonlocal last_error
            if errorCode not in [2104, 2106, 2158]:
                last_error = f"IB Error [{errorCode}]: {errorString}"

        self.ib.errorEvent += on_error
        try:
            # Request historical data from the API
            bars = await self.ib.reqHistoricalDataAsync(
                contract,
                endDateTime="", # Current time
                durationStr=duration,
                barSizeSetting=bar_size,
                whatToShow=what_to_show,
                useRTH=use_rth,
                formatDate=2, # Return timezone-aware datetime objects
                keepUpToDate=False
            )
            
            if last_error:
                raise ValueError(last_error)
                
            if not bars:
                logger.warning(f"No historical data returned for {symbol} ({bar_size})")
                return pd.DataFrame()
                
            # Convert BarData list to DataFrame
            df = util.df(bars)
            
            if df is None or df.empty:
                logger.warning(f"DataFrame conversion resulted in empty df for {symbol} ({bar_size})")
                return pd.DataFrame()
                
            # Clean and structure columns
            df = df.rename(columns={"date": "datetime"})
            
            # Select required columns: datetime, open, high, low, close, volume
            required_cols = ["datetime", "open", "high", "low", "close", "volume"]
            df = df[required_cols]
            
            # Format datetime index for consistency
            df["datetime"] = pd.to_datetime(df["datetime"])
            
            logger.success(f"Retrieved {len(df)} bars of historical data for {symbol} ({bar_size})")
            return df
            
        except Exception as e:
            logger.error(f"Failed to retrieve historical bars for {symbol}: {e}")
            raise
        finally:
            self.ib.errorEvent -= on_error

async def main():
    """Example usage of HistoricalDataService."""
    setup_logger()
    logger.info("Starting HistoricalDataService Test Scenario...")
    
    conn = ConnectionManager()
    connected = await conn.connect()
    
    if not connected:
        logger.error("Could not run test scenario. Connection failed.")
        return
        
    contract_service = ContractService(conn.ib)
    hist_service = HistoricalDataService(conn.ib)
    
    try:
        symbols = ["AAPL", "NVDA", "TSLA"]
        
        # Define combinations: (label, duration, bar_size)
        bar_configs = [
            ("1 minute", "1 D", "1 min"),
            ("5 minute", "2 D", "5 mins"),
            ("15 minute", "5 D", "15 mins"),
            ("Daily", "30 D", "1 day")
        ]
        
        for symbol in symbols:
            contract = await contract_service.get_qualified_contract(symbol)
            if not contract:
                logger.error(f"Cannot run historical test for {symbol}: contract resolution failed.")
                continue
                
            for label, duration, bar_size in bar_configs:
                logger.info(f"--- Fetching {label} candles for {symbol} ---")
                df = await hist_service.get_historical_bars(contract, duration, bar_size)
                if not df.empty:
                    print(df.head(3))
                    print(f"Total Rows: {len(df)}\n")
                else:
                    logger.warning(f"Empty DataFrame returned for {symbol} ({bar_size})")
                
                # Small delay to prevent pacing violations
                await asyncio.sleep(1)
                
    except Exception as e:
        logger.exception(f"Unexpected error in HistoricalDataService test: {e}")
    finally:
        conn.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
