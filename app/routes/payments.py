from flask import Blueprint, request, jsonify
from app.extensions import db
from app.models.order import Order
from app.models.payment import Payment, PaymentMethod, PaymentStatus

payments_bp = Blueprint("payments", __name__)

@payments_bp.route("/orders/<int:order_id>/payment", methods=["POST"])
def register_simulated_payment(order_id):
    """Registra o pagamento simulado para um pedido."""
    order = Order.query.get(order_id)
    if not order:
        return jsonify({
            "success": False,
            "error": "Pedido não encontrado.",
            "status_code": 404
        }), 404

    if order.payment:
        return jsonify({
            "success": False,
            "error": "Este pedido já possui um pagamento registrado.",
            "status_code": 400
        }), 400

    data = request.get_json(silent=True) or {}
    method = data.get("method", "").strip().lower()
    amount = data.get("amount")

    if not method:
        return jsonify({
            "success": False,
            "error": "O campo 'method' é obrigatório (dinheiro, cartao ou pix).",
            "status_code": 400
        }), 400

    if method not in PaymentMethod.ALL:
        return jsonify({
            "success": False,
            "error": f"Forma de pagamento inválida. Opções: {', '.join(PaymentMethod.ALL)}",
            "status_code": 400
        }), 400

    if amount is None:
        amount = float(order.total_amount)
    else:
        try:
            amount = float(amount)
        except (ValueError, TypeError):
            return jsonify({
                "success": False,
                "error": "Valor de pagamento inválido.",
                "status_code": 400
            }), 400

    payment = Payment(
        order_id=order.id,
        method=method,
        amount=amount,
        status=PaymentStatus.PAGO
    )
    db.session.add(payment)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Pagamento simulado registrado com sucesso.",
        "data": payment.to_dict()
    }), 201

@payments_bp.route("/orders/<int:order_id>/payment", methods=["GET"])
def get_order_payment(order_id):
    """Consulta os dados de pagamento do pedido."""
    order = Order.query.get(order_id)
    if not order:
        return jsonify({
            "success": False,
            "error": "Pedido não encontrado.",
            "status_code": 404
        }), 404

    if not order.payment:
        return jsonify({
            "success": False,
            "error": "Nenhum pagamento registrado para este pedido.",
            "status_code": 404
        }), 404

    return jsonify({
        "success": True,
        "data": order.payment.to_dict()
    }), 200
