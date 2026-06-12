"""Create instruments table

Revision ID: 001
Revises:
Create Date: 2026-06-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "instruments",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("symbol", sa.String(length=50), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("asset_type", sa.String(length=20), nullable=False),
        sa.Column("exchange", sa.String(length=20), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("ibkr_conid", sa.BigInteger(), nullable=True),
        sa.Column("local_symbol", sa.String(length=100), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("symbol"),
    )
    op.create_index("ix_instruments_symbol", "instruments", ["symbol"])
    op.create_index("ix_instruments_asset_type", "instruments", ["asset_type"])
    op.create_index("ix_instruments_exchange", "instruments", ["exchange"])
    op.create_index("ix_instruments_ibkr_conid", "instruments", ["ibkr_conid"])
    op.create_index(
        "ix_instruments_unresolved",
        "instruments",
        ["id"],
        postgresql_where=sa.text("ibkr_conid IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_instruments_unresolved", table_name="instruments")
    op.drop_index("ix_instruments_ibkr_conid", table_name="instruments")
    op.drop_index("ix_instruments_exchange", table_name="instruments")
    op.drop_index("ix_instruments_asset_type", table_name="instruments")
    op.drop_index("ix_instruments_symbol", table_name="instruments")
    op.drop_table("instruments")
