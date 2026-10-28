from datetime import datetime
from app.extensions import db

class OrderStatus:
    RECEBIDO = "recebido"
    EM_PREPARO = "em_preparo"
    PRONTO = "pronto"
    ENTREGUE = "entregue"
    CANCELADO = "cancelado"

    ALL = [RECEBIDO, EM_PREPARO, PRONTO, ENTREGUE, CANCELADO]
    KITCHEN = [RECEBIDO, EM_PREPARO, PRONTO]
    TRANSITIONS = {
        RECEBIDO: {EM_PREPARO, CANCELADO},
        EM_PREPARO: {PRONTO, CANCELADO},
        PRONTO: {ENTREGUE},
        ENTREGUE: set(),
        CANCELADO: set(),
    }

class Order(db.Model):
    """Modelo de pedido da cafeteria."""
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    customer_name = db.Column(db.String(120), nullable=True)
    table_number = db.Column(db.String(50), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(30), default=OrderStatus.RECEBIDO, nullable=False, index=True)
    total_amount = db.Column(db.Numeric(10, 2), default=0.00, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    items = db.relationship("OrderItem", backref="order", cascade="all, delete-orphan", lazy=True)
    payment = db.relationship("Payment", backref="order", uselist=False, cascade="all, delete-orphan")

    def to_dict(self, include_items=True):
        data = {
            "id": self.id,
            "customer_name": self.customer_name,
            "table_number": self.table_number,
            "notes": self.notes,
            "status": self.status,
            "total_amount": float(self.total_amount),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "items_count": len(self.items) if self.items else 0
        }
        if include_items:
            data["items"] = [item.to_dict() for item in self.items]
            data["payment"] = self.payment.to_dict() if self.payment else None
        return data


class OrderItem(db.Model):
    """Modelo de associação entre Pedido e Produto."""
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False, index=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)

    product = db.relationship("Product", lazy=True)

    @property
    def subtotal(self):
        return float(self.unit_price) * self.quantity

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "product_name": self.product.name if self.product else None,
            "quantity": self.quantity,
            "unit_price": float(self.unit_price),
            "subtotal": round(self.subtotal, 2)
        }
