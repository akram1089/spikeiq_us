import asyncio
import json
from typing import Dict, Any, List
from loguru import logger
from ib_insync import IB, AccountValue
from src.connection_manager import ConnectionManager
from src.utils.logger import setup_logger

class AccountService:
    """Retrieves and verifies account credentials and financial summaries from IB Gateway."""
    
    def __init__(self, ib: IB):
        self.ib = ib

    def verify_account_access(self) -> bool:
        """Verifies that the API connection has access to managed accounts."""
        try:
            accounts = self.ib.managedAccounts()
            if accounts:
                logger.success(f"Account access verified. Managed accounts: {accounts}")
                return True
            logger.warning("No managed accounts returned. Verify API connection permissions.")
            return False
        except Exception as e:
            logger.error(f"Error verifying account access: {e}")
            return False

    def get_account_values(self) -> List[AccountValue]:
        """Retrieves raw account values from the synchronized IB session."""
        try:
            values = self.ib.accountValues()
            if not values:
                logger.warning("No account values returned. Ensure gateway login is complete.")
            return values
        except Exception as e:
            logger.error(f"Error fetching account values: {e}")
            return []

    def get_structured_summary(self) -> Dict[str, Any]:
        """Fetches and structures key financial indicators into a dictionary.
        
        Focuses on key metrics: NetLiquidation, TotalCashValue, BuyingPower, and GrossPositionValue.
        """
        raw_values = self.get_account_values()
        structured = {}
        
        # Standard metrics we want to extract
        target_tags = {
            "NetLiquidation": "net_liquidation",
            "TotalCashValue": "total_cash_value",
            "BuyingPower": "buying_power",
            "GrossPositionValue": "gross_position_value",
            "AvailableFunds": "available_funds",
            "ExcessLiquidity": "excess_liquidity"
        }
        
        for val in raw_values:
            if val.tag in target_tags:
                mapped_name = target_tags[val.tag]
                try:
                    num_val = float(val.value)
                except ValueError:
                    num_val = val.value
                    
                structured[mapped_name] = {
                    "value": num_val,
                    "currency": val.currency,
                    "account": val.account
                }
                
        return structured

async def main():
    """Example usage of AccountService."""
    setup_logger()
    logger.info("Starting AccountService Test Scenario...")
    
    conn = ConnectionManager()
    connected = await conn.connect()
    
    if not connected:
        logger.error("Could not run test scenario. Connection failed.")
        return
        
    try:
        service = AccountService(conn.ib)
        
        # Step 1: Verify Access
        has_access = service.verify_account_access()
        logger.info(f"Access Verification Result: {has_access}")
        
        # Step 2: Get Summary
        summary = service.get_structured_summary()
        logger.info(f"Structured Account Summary:\n{json.dumps(summary, indent=4)}")
        
    except Exception as e:
        logger.exception(f"Unexpected error in AccountService test: {e}")
    finally:
        conn.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
