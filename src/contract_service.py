import asyncio
import json
from typing import List, Dict, Any, Optional
from loguru import logger
from ib_insync import IB, Stock, Contract
from src.connection_manager import ConnectionManager
from src.utils.logger import setup_logger

class ContractService:
    """Handles resolution, qualification, and retrieval of contract details from the IB API."""
    
    def __init__(self, ib: IB):
        self.ib = ib

    async def get_qualified_contract(self, symbol: str, sec_type: str = "STK", currency: str = "USD", exchange: str = "SMART") -> Optional[Contract]:
        """Resolves and qualifies a contract against the IB system asynchronously.
        
        Qualification populates missing details like unique Contract ID (conId), 
        trading class, and primary exchange.
        """
        try:
            if sec_type == "STK":
                contract = Stock(symbol, exchange, currency)
            else:
                contract = Contract(symbol=symbol, secType=sec_type, exchange=exchange, currency=currency)
                
            logger.info(f"Qualifying contract for symbol '{symbol}'...")
            qualified = await self.ib.qualifyContractsAsync(contract)
            
            if qualified:
                logger.success(f"Contract qualified: {symbol} (conId: {qualified[0].conId})")
                return qualified[0]
            else:
                logger.warning(f"Failed to qualify contract for symbol: {symbol}")
                return None
        except Exception as e:
            logger.error(f"Error qualifying contract for '{symbol}': {e}")
            return None

    async def get_multiple_contracts_details(self, symbols: List[str]) -> Dict[str, Any]:
        """Retrieves and returns structured details for a list of symbols as a dictionary."""
        results = {}
        for symbol in symbols:
            contract = await self.get_qualified_contract(symbol)
            if contract:
                results[symbol] = {
                    "conId": contract.conId,
                    "exchange": contract.exchange,
                    "currency": contract.currency,
                    "primaryExchange": getattr(contract, "primaryExchange", "N/A"),
                    "tradingClass": getattr(contract, "tradingClass", "N/A")
                }
            else:
                results[symbol] = {"error": "Failed to qualify contract"}
        return results

async def main():
    """Example usage of ContractService."""
    setup_logger()
    logger.info("Starting ContractService Test Scenario...")
    
    conn = ConnectionManager()
    connected = await conn.connect()
    
    if not connected:
        logger.error("Could not run test scenario. Connection failed.")
        return
        
    try:
        service = ContractService(conn.ib)
        symbols = ["AAPL", "NVDA", "TSLA", "AMD", "META", "SPY", "QQQ"]
        
        logger.info(f"Querying details for symbols: {symbols}")
        details = await service.get_multiple_contracts_details(symbols)
        
        logger.info(f"Contract Details Output:\n{json.dumps(details, indent=4)}")
        
    except Exception as e:
        logger.exception(f"Unexpected error in ContractService test: {e}")
    finally:
        conn.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
