from datetime import datetime
from app.extensions import db

class PaymentMethod:
    DINHEIRO = "dinheiro"
    CARTAO = "cartao"
    PIX = "pix"

    ALL = [DINHEIRO, CARTAO, PIX]

class PaymentStatus:
    PENDENTE = "pendente"
    PAGO = "pago"
    CANCELADO = "cancelado"

    ALL = [PENDENTE, PAGO, CANCELADO]

class Payment(db.Model):
    """Modelo de pagamento simulado do pedido."""
    __tablename__ = "payments"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), unique=True, nullable=False, index=True)
    method = db.Column(db.String(30), nullable=False)  # dinheiro, cartao, pix
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    status = db.Column(db.String(30), default=PaymentStatus.PAGO, nullable=False)
    paid_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "payment_id": self.id,
            "order_id": self.order_id,
            "method": self.method,
            "amount": float(self.amount),
            "status": self.status,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None
        }
