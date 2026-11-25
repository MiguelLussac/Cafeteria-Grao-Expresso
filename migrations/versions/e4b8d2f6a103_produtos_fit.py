"""produtos: 10 itens fit com foto e tabela nutricional manual

Revision ID: e4b8d2f6a103
Revises: c7e2f4a91d36
Create Date: 2026-11-25 12:00:00.000000

Migração de dados: cadastra opções leves na categoria "fitness" em todos os
bancos (inclusive o do Supabase em produção, onde o seed não roda). A tabela
nutricional entra como "manual", então a Edge Function de IA não a altera.
Itens com o mesmo nome já cadastrados são mantidos como estão.
"""
from datetime import datetime

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e4b8d2f6a103'
down_revision = 'c7e2f4a91d36'
branch_labels = None
depends_on = None

# (nome, descrição, preço, porção, unidade, proteína g, carboidratos g, gorduras g)
# Calorias = 4 kcal/g de proteína e carboidrato + 9 kcal/g de gordura.
FIT_PRODUCTS = (
    ("Smoothie Verde Detox",
     "Couve, maçã verde, gengibre, limão e água de coco. Sem açúcar adicionado",
     14.00, 300, "ml", 2.0, 24.0, 0.5),
    ("Shake Proteico de Cacau",
     "Whey protein, leite desnatado e cacau 100%. Sem açúcar adicionado",
     18.00, 300, "ml", 28.0, 15.0, 2.5),
    ("Cold Brew com Leite de Amêndoas",
     "Café extraído a frio por 16 horas com leite de amêndoas sem açúcar",
     12.00, 300, "ml", 1.5, 2.0, 3.5),
    ("Iogurte Grego Zero com Morangos",
     "Iogurte grego natural desnatado, morangos frescos e folhas de hortelã",
     12.50, 170, "g", 15.0, 12.0, 0.5),
    ("Overnight Oats de Frutas Vermelhas",
     "Aveia, iogurte desnatado, chia e frutas vermelhas. Sem açúcar adicionado",
     15.00, 200, "g", 11.0, 30.0, 5.0),
    ("Mousse Proteico de Maracujá",
     "Mousse leve de maracujá com iogurte desnatado e whey, adoçado com stévia",
     11.00, 120, "g", 12.0, 10.0, 2.0),
    ("Muffin Integral de Banana e Aveia",
     "Farinha integral, aveia, banana e canela. Sem açúcar refinado",
     8.50, 70, "g", 5.0, 22.0, 4.0),
    ("Crepioca de Frango",
     "Massa de ovo e tapioca recheada com frango desfiado e tomate",
     16.00, 150, "g", 20.0, 14.0, 6.0),
    ("Wrap Integral de Frango com Cottage",
     "Tortilha integral, peito de frango grelhado, queijo cottage e folhas verdes",
     19.00, 160, "g", 22.0, 24.0, 6.0),
    ("Salada Proteica de Grão-de-Bico",
     "Grão-de-bico, pepino, tomate, cebola roxa, salsinha e azeite extravirgem",
     17.00, 200, "g", 12.0, 22.0, 6.0),
)

# Fotos livres do Wikimedia Commons (autoria e licença em docs/creditos_imagens.md).
IMAGES = {
    'Smoothie Verde Detox':
        'https://upload.wikimedia.org/wikipedia/commons/c/ce/Green_smoothie_%288222465502%29.jpg',
    'Shake Proteico de Cacau':
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c2/Protein_shake.jpg/960px-Protein_shake.jpg',
    'Cold Brew com Leite de Amêndoas':
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8e/Zendo_cold_brew_with_almond_milk_%2824181494773%29.jpg/960px-Zendo_cold_brew_with_almond_milk_%2824181494773%29.jpg',
    'Iogurte Grego Zero com Morangos':
        'https://upload.wikimedia.org/wikipedia/commons/b/b1/Strawberries_%26_Yogurt.jpg',
    'Overnight Oats de Frutas Vermelhas':
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4c/Healthy_Oatmeal_with_Berries_-_49859913257.jpg/960px-Healthy_Oatmeal_with_Berries_-_49859913257.jpg',
    'Mousse Proteico de Maracujá':
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/64/Mousse_de_maracuj%C3%A1.jpg/960px-Mousse_de_maracuj%C3%A1.jpg',
    'Muffin Integral de Banana e Aveia':
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1d/Banana_muffin_%281%29.jpg/960px-Banana_muffin_%281%29.jpg',
    'Crepioca de Frango':
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Tapioca_no_Encruzo.jpg/960px-Tapioca_no_Encruzo.jpg',
    'Wrap Integral de Frango com Cottage':
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f8/Smoked_chicken_and_avocado_wrap.jpg/960px-Smoked_chicken_and_avocado_wrap.jpg',
    'Salada Proteica de Grão-de-Bico':
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fb/Colorful_healthy_Chickpea_Salad_-_49859083608.jpg/960px-Colorful_healthy_Chickpea_Salad_-_49859083608.jpg',
}

products = sa.table(
    'products',
    sa.column('id', sa.Integer),
    sa.column('name', sa.String),
    sa.column('description', sa.Text),
    sa.column('price', sa.Numeric),
    sa.column('category', sa.String),
    sa.column('is_active', sa.Boolean),
    sa.column('image_url', sa.String),
    sa.column('serving_size', sa.Numeric),
    sa.column('serving_unit', sa.String),
    sa.column('calories_kcal', sa.Numeric),
    sa.column('protein_g', sa.Numeric),
    sa.column('carbs_g', sa.Numeric),
    sa.column('fat_g', sa.Numeric),
    sa.column('nutrition_source', sa.String),
    sa.column('nutrition_status', sa.String),
    sa.column('created_at', sa.DateTime),
    sa.column('updated_at', sa.DateTime),
)
order_items = sa.table('order_items', sa.column('product_id', sa.Integer))

FIT_NAMES = [p[0] for p in FIT_PRODUCTS]


def upgrade():
    bind = op.get_bind()
    existing = set(bind.execute(sa.select(products.c.name).where(products.c.name.in_(FIT_NAMES))).scalars())
    now = datetime.utcnow()
    rows = [
        {
            'name': name, 'description': description, 'price': price, 'category': 'fitness',
            'is_active': True, 'image_url': IMAGES[name], 'serving_size': size, 'serving_unit': unit,
            'calories_kcal': round(4 * protein + 4 * carbs + 9 * fat, 1),
            'protein_g': protein, 'carbs_g': carbs, 'fat_g': fat,
            'nutrition_source': 'manual', 'nutrition_status': 'ready',
            'created_at': now, 'updated_at': now,
        }
        for name, description, price, size, unit, protein, carbs, fat in FIT_PRODUCTS
        if name not in existing
    ]
    if rows:
        op.bulk_insert(products, rows)


def downgrade():
    # Remove só os itens nunca pedidos; os que já estão em pedidos ficam
    # apenas desativados para não quebrar o histórico.
    in_orders = sa.select(order_items.c.product_id)
    fit = sa.and_(products.c.name.in_(FIT_NAMES), products.c.nutrition_source == 'manual',
                  products.c.category == 'fitness')
    op.execute(products.update().where(fit, products.c.id.in_(in_orders)).values(is_active=False))
    op.execute(products.delete().where(fit, products.c.id.not_in(in_orders)))
