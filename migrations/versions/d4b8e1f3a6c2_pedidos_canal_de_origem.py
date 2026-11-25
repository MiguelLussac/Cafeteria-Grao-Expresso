"""pedidos: canal de origem (site, totem ou balcão)

Revision ID: d4b8e1f3a6c2
Revises: c7e2f4a91d36
Create Date: 2026-11-25 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4b8e1f3a6c2'
down_revision = 'c7e2f4a91d36'
branch_labels = None
depends_on = None


def upgrade():
    # Pedidos já existentes ficam com NULL: não há como saber por onde entraram.
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('channel', sa.String(length=10), nullable=True))
        batch_op.create_check_constraint(
            'ck_orders_channel', "channel IS NULL OR channel IN ('site', 'totem', 'balcao')")


def downgrade():
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.drop_constraint('ck_orders_channel', type_='check')
        batch_op.drop_column('channel')
