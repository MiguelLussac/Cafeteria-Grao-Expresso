"""produtos: restrições da tabela nutricional

Revision ID: a3c51e7d9b20
Revises: 17f19b29b50d
Create Date: 2026-10-29 19:40:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'a3c51e7d9b20'
down_revision = '17f19b29b50d'
branch_labels = None
depends_on = None

# Cópia das regras de app/models/product.py no momento desta migração.
NUTRITION_CHECKS = {
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


def upgrade():
    with op.batch_alter_table('products', schema=None) as batch_op:
        for name, condition in NUTRITION_CHECKS.items():
            batch_op.create_check_constraint(name, condition)


def downgrade():
    with op.batch_alter_table('products', schema=None) as batch_op:
        for name in reversed(list(NUTRITION_CHECKS)):
            batch_op.drop_constraint(name, type_='check')
