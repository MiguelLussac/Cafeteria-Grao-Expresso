from flask import Blueprint, jsonify
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentStatus

display_bp = Blueprint("display", __name__)


@display_bp.route("/orders/display", methods=["GET"])
def list_orders_for_display():
    """Pedidos pagos e em andamento para o monitor público (TV).

    Rota pública: devolve SOMENTE 'id' e 'status', em ordem de chegada.
    Nenhum dado do cliente (nome, mesa, observações, valores, pagamento) é carregado.
    """
    rows = (
        Order.query
        .join(Payment, Payment.order_id == Order.id)
        .filter(
            Payment.status == PaymentStatus.PAGO,
            Order.status.in_(OrderStatus.KITCHEN),
        )
        .order_by(Order.created_at.asc(), Order.id.asc())
        .with_entities(Order.id, Order.status)
        .all()
    )

    return jsonify({
        "success": True,
        "count": len(rows),
        "data": [{"id": order_id, "status": status} for order_id, status in rows]
    }), 200