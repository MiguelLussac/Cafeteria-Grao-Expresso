from datetime import datetime
from app.extensions import db

NUTRITION_COLUMNS = (
    "serving_size", "serving_unit", "calories_kcal", "protein_g", "carbs_g", "fat_g", "nutrition_source",
)
SERVING_UNITS = ("g", "ml")
# pending: aguardando a IA; ready: tabela preenchida; failed: a IA não conseguiu estimar.
NUTRITION_STATUSES = ("pending", "ready", "failed")

# Regras da tabela nutricional garantidas pelo próprio banco, já que a Edge
# Function do Supabase grava esses campos sem passar pela API Flask.
NUTRITION_CHECKS = {
    "ck_products_nutrition_complete": (
        "(" + " AND ".join(f"{c} IS NULL" for c in NUTRITION_COLUMNS) + ") OR ("
        + " AND ".join(f"{c} IS NOT NULL" for c in NUTRITION_COLUMNS) + ")"
    ),
    "ck_products_nutrition_range": (
        "serving_size IS NULL OR ("
        "serving_size > 0 AND serving_size <= 5000"
        " AND calories_kcal >= 0 AND calories_kcal <= 10000"
        " AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0"
        " AND protein_g + carbs_g + fat_g <= serving_size)"
    ),
    "ck_products_nutrition_source": "nutrition_source IS NULL OR nutrition_source IN ('manual', 'ai')",
    "ck_products_serving_unit": "serving_unit IS NULL OR serving_unit IN ('g', 'ml')",
    # "ready" sempre com tabela; "pending"/"failed" sempre sem tabela.
    "ck_products_nutrition_status": (
        "(nutrition_status = 'ready' AND calories_kcal IS NOT NULL)"
        " OR (nutrition_status IN ('pending', 'failed') AND calories_kcal IS NULL)"
    ),
}


class Product(db.Model):
    """Modelo de produtos do cardápio."""
    __tablename__ = "products"
    __table_args__ = tuple(db.CheckConstraint(sql, name=name) for name, sql in NUTRITION_CHECKS.items())

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    category = db.Column(db.String(50), nullable=False, default="bebidas", index=True)  # bebidas, doces, salgados
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    image_url = db.Column(db.String(500), nullable=True)

    # Tabela nutricional média por porção. Todos os campos ficam vazios ou
    # todos preenchidos; nutrition_source indica a origem: "manual" ou "ai".
    # A porção é em gramas ou, para bebidas e outros líquidos, em mililitros.
    serving_size = db.Column(db.Numeric(7, 1), nullable=True)
    serving_unit = db.Column(db.String(2), nullable=True)
    calories_kcal = db.Column(db.Numeric(7, 1), nullable=True)
    protein_g = db.Column(db.Numeric(7, 1), nullable=True)
    carbs_g = db.Column(db.Numeric(7, 1), nullable=True)
    fat_g = db.Column(db.Numeric(7, 1), nullable=True)
    nutrition_source = db.Column(db.String(10), nullable=True)
    nutrition_status = db.Column(db.String(10), nullable=False, default="pending", server_default="pending")

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def nutrition_dict(self):
        if self.calories_kcal is None:
            return None
        return {
            "serving_size": float(self.serving_size),
            "serving_unit": self.serving_unit,
            "calories_kcal": float(self.calories_kcal),
            "protein_g": float(self.protein_g),
            "carbs_g": float(self.carbs_g),
            "fat_g": float(self.fat_g),
            "source": self.nutrition_source,
        }

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "price": float(self.price),
            "category": self.category,
            "is_active": self.is_active,
            "image_url": self.image_url,
            "nutrition": self.nutrition_dict(),
            "nutrition_status": self.nutrition_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
