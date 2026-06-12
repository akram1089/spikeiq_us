from src.security_master.models import Instrument
from src.security_master.schemas import InstrumentResponse


def to_response(inst: Instrument) -> InstrumentResponse:
    return InstrumentResponse(
        instrument_id=inst.id,
        symbol=inst.symbol,
        name=inst.name,
        asset_type=inst.asset_type,
        exchange=inst.exchange,
        currency=inst.currency,
        ibkr_conid=inst.ibkr_conid,
        local_symbol=inst.local_symbol,
        is_active=inst.is_active,
        created_at=inst.created_at,
        updated_at=inst.updated_at,
    )


def publish_instrument_event(inst: Instrument, action: str) -> None:
    from src.security_master.events import publish_security_master_update

    publish_security_master_update(
        instrument_id=inst.id,
        symbol=inst.symbol,
        asset_type=inst.asset_type,
        ibkr_conid=inst.ibkr_conid,
        exchange=inst.exchange,
        currency=inst.currency,
        is_active=inst.is_active,
        action=action,
    )
