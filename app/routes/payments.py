from flask import Blueprint, request, jsonify
from decimal import Decimal, InvalidOperation
from sqlalchemy.exc import SQLAlchemyError
from app.extensions import db
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.services.sse_service import sse_broker

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

    if order.status != OrderStatus.RECEBIDO:
        return jsonify({"success": False, "error": "Pedido não está aguardando pagamento.",
                        "status_code": 409}), 409

    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({"success": False, "error": "Corpo deve ser um objeto JSON.",
                        "status_code": 400}), 400
    value = data.get("method")
    method = value.strip().lower() if isinstance(value, str) else ""
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
        amount = order.total_amount
    else:
        try:
            amount = Decimal(str(amount))
        except (InvalidOperation, ValueError, TypeError):
            return jsonify({
                "success": False,
                "error": "Valor de pagamento inválido.",
                "status_code": 400
            }), 400

    if not amount.is_finite() or amount <= 0 or amount != order.total_amount:
        return jsonify({"success": False,
                        "error": "O pagamento deve corresponder ao total positivo do pedido.",
                        "status_code": 400}), 400

    payment = Payment(
        order_id=order.id,
        method=method,
        amount=amount,
        status=PaymentStatus.PAGO
    )
    db.session.add(payment)
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"success": False, "error": "Falha ao registrar pagamento.",
                        "status_code": 500}), 500

    # Mantém o nome de evento existente, agora somente após liberação persistida.
    sse_broker.publish("new_order", {"order_id": order.id, **order.to_dict()})

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
