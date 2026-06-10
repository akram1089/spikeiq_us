from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from loguru import logger
from src.auth.router import get_current_user
from src.queue.kafka_producer import kafka_producer

router = APIRouter(prefix="/api/market", tags=["market"])

class SubscriptionPayload(BaseModel):
    con_id: int
    symbol: str

@router.post("/subscribe")
async def subscribe(payload: SubscriptionPayload, user: dict = Depends(get_current_user)):
    username = user["sub"]
    symbol_upper = payload.symbol.strip().upper()
    
    event = {
        "user_id": username,
        "con_id": payload.con_id,
        "symbol": symbol_upper,
        "action": "SUBSCRIBE",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        # Publish event to Kafka
        kafka_producer.publish(
            topic="user-subscriptions",
            key=username,
            value=event
        )
        logger.info(f"Published SUBSCRIBE event to user-subscriptions for {username} -> {symbol_upper}")
        return {"status": "accepted", "message": f"Subscription request for {symbol_upper} queued"}
    except Exception as e:
        logger.error(f"Failed to queue subscription for {symbol_upper}: {e}")
        raise HTTPException(status_code=500, detail="Failed to queue subscription request")

@router.post("/unsubscribe")
async def unsubscribe(payload: SubscriptionPayload, user: dict = Depends(get_current_user)):
    username = user["sub"]
    symbol_upper = payload.symbol.strip().upper()
    
    event = {
        "user_id": username,
        "con_id": payload.con_id,
        "symbol": symbol_upper,
        "action": "UNSUBSCRIBE",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        # Publish event to Kafka
        kafka_producer.publish(
            topic="user-subscriptions",
            key=username,
            value=event
        )
        logger.info(f"Published UNSUBSCRIBE event to user-subscriptions for {username} -> {symbol_upper}")
        return {"status": "accepted", "message": f"Unsubscribe request for {symbol_upper} queued"}
    except Exception as e:
        logger.error(f"Failed to queue unsubscribe for {symbol_upper}: {e}")
        raise HTTPException(status_code=500, detail="Failed to queue unsubscribe request")
