from unittest.mock import MagicMock, patch

from src.db.clickhouse_client import ClickHouseManager


def test_resolve_catalog_is_active_honours_user_subscription():
    mgr = ClickHouseManager()
    with patch.object(mgr, "has_active_user_subscription", return_value=True) as mock_sub:
        assert mgr.resolve_catalog_is_active(
            con_id=416904, stream_active=False, instrument_id=1
        ) is True
        mock_sub.assert_called_once_with(416904, instrument_id=1, client=None)


def test_resolve_catalog_is_active_deactivates_when_not_subscribed():
    mgr = ClickHouseManager()
    with patch.object(mgr, "has_active_user_subscription", return_value=False):
        assert mgr.resolve_catalog_is_active(
            con_id=416904, stream_active=False, instrument_id=1
        ) is False


def test_resolve_catalog_is_active_sync_stream_active_wins():
    mgr = ClickHouseManager()
    with patch.object(mgr, "has_active_user_subscription") as mock_sub:
        assert mgr.resolve_catalog_is_active(
            con_id=416904, stream_active=True, instrument_id=1
        ) is True
        mock_sub.assert_not_called()


def test_deactivate_catalog_skips_when_users_subscribed():
    mgr = ClickHouseManager()
    with patch.object(mgr, "has_active_user_subscription", return_value=True):
        with patch.object(mgr, "get_client") as mock_client:
            mgr.deactivate_catalog_instrument(416904)
            mock_client.assert_not_called()


def test_security_master_sync_preserves_user_subscribed_instruments():
    from src.workers.security_master_sync_worker import SecurityMasterSyncWorker

    worker = SecurityMasterSyncWorker()
    worker._db_client = MagicMock()
    worker.market_data_service = None

    with patch.object(
        worker._db_client,
        "insert",
    ) as mock_insert, patch(
        "src.workers.security_master_sync_worker.ch_manager.resolve_catalog_is_active",
        return_value=True,
    ):
        worker._upsert_clickhouse(
            {
                "ibkr_conid": 416904,
                "symbol": "SPX",
                "asset_type": "INDEX",
                "exchange": "CBOE",
                "currency": "USD",
                "instrument_id": 10,
                "stream_active": False,
            }
        )
        mock_insert.assert_called_once()
        row = mock_insert.call_args[0][1][0]
        assert row[-1] == 1
