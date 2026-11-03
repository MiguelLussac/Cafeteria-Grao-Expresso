"""produtos: unidade da porção (g/ml) e status da tabela nutricional

Revision ID: c7e2f4a91d36
Revises: a3c51e7d9b20
Create Date: 2026-11-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c7e2f4a91d36'
down_revision = 'a3c51e7d9b20'
branch_labels = None
depends_on = None

# Regras da revisão a3c51e7d9b20, recriadas no downgrade.
PREVIOUS_CHECKS = {
    'ck_products_nutrition_complete': (
        '(serving_size_g IS NULL AND calories_kcal IS NULL AND protein_g IS NULL AND carbs_g IS NULL AND fat_g IS NULL AND nutrition_source IS NULL) OR (serving_size_g IS NOT NULL AND calories_kcal IS NOT NULL AND protein_g IS NOT NULL AND carbs_g IS NOT NULL AND fat_g IS NOT NULL AND nutrition_source IS NOT NULL)'
    ),
    'ck_products_nutrition_range': (
        'serving_size_g IS NULL OR (serving_size_g > 0 AND serving_size_g <= 5000 AND calories_kcal >= 0 AND calories_kcal <= 10000 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0 AND protein_g + carbs_g + fat_g <= serving_size_g)'
    ),
    'ck_products_nutrition_source': (
        "nutrition_source IS NULL OR nutrition_source IN ('manual', 'ai')"
    ),
}

# Cópia das regras de app/models/product.py no momento desta migração.
NUTRITION_CHECKS = {
    'ck_products_nutrition_complete': (
        '(serving_size IS NULL AND serving_unit IS NULL AND calories_kcal IS NULL AND protein_g IS NULL AND carbs_g IS NULL AND fat_g IS NULL AND nutrition_source IS NULL) OR (serving_size IS NOT NULL AND serving_unit IS NOT NULL AND calories_kcal IS NOT NULL AND protein_g IS NOT NULL AND carbs_g IS NOT NULL AND fat_g IS NOT NULL AND nutrition_source IS NOT NULL)'
    ),
    'ck_products_nutrition_range': (
        'serving_size IS NULL OR (serving_size > 0 AND serving_size <= 5000 AND calories_kcal >= 0 AND calories_kcal <= 10000 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0 AND protein_g + carbs_g + fat_g <= serving_size)'
    ),
    'ck_products_nutrition_source': (
        "nutrition_source IS NULL OR nutrition_source IN ('manual', 'ai')"
    ),
    'ck_products_serving_unit': (
        "serving_unit IS NULL OR serving_unit IN ('g', 'ml')"
    ),
    'ck_products_nutrition_status': (
        "(nutrition_status = 'ready' AND calories_kcal IS NOT NULL) OR (nutrition_status IN ('pending', 'failed') AND calories_kcal IS NULL)"
    ),
}


def upgrade():
    with op.batch_alter_table('products', schema=None) as batch_op:
        for name in PREVIOUS_CHECKS:
            batch_op.drop_constraint(name, type_='check')
        batch_op.alter_column('serving_size_g', new_column_name='serving_size',
                              existing_type=sa.Numeric(precision=7, scale=1), existing_nullable=True)
        batch_op.add_column(sa.Column('serving_unit', sa.String(length=2), nullable=True))
        batch_op.add_column(sa.Column('nutrition_status', sa.String(length=10), nullable=False,
                                      server_default='pending'))

    # Tabelas existentes foram estimadas em gramas.
    op.execute("UPDATE products SET serving_unit = 'g', nutrition_status = 'ready' WHERE calories_kcal IS NOT NULL")

    with op.batch_alter_table('products', schema=None) as batch_op:
        for name, condition in NUTRITION_CHECKS.items():
            batch_op.create_check_constraint(name, condition)


def downgrade():
    with op.batch_alter_table('products', schema=None) as batch_op:
        for name in NUTRITION_CHECKS:
            batch_op.drop_constraint(name, type_='check')
        batch_op.drop_column('nutrition_status')
        batch_op.drop_column('serving_unit')
        batch_op.alter_column('serving_size', new_column_name='serving_size_g',
                              existing_type=sa.Numeric(precision=7, scale=1), existing_nullable=True)

    with op.batch_alter_table('products', schema=None) as batch_op:
        for name, condition in PREVIOUS_CHECKS.items():
            batch_op.create_check_constraint(name, condition)
