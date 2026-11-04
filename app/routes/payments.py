from decimal import Decimal, InvalidOperation
from flask import Blueprint, current_app, jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.services.sse_service import sse_broker

payments_bp = Blueprint("payments", __name__)


def _erro(mensagem, status=400):
    return jsonify({
        "success": False,
        "error": mensagem,
        "status_code": status
    }), status


@payments_bp.route("/orders/<int:order_id>/payment", methods=["POST"])
def register_simulated_payment(order_id):
    """Registra o pagamento simulado para um pedido."""
    order = Order.query.get(order_id)
    if not order:
        current_app.logger.warning("Pagamento rejeitado: pedido inexistente. order_id=%s", order_id)
        return _erro("Pedido não encontrado.", 404)

    if order.payment:
        current_app.logger.warning("Pagamento rejeitado: pedido já possui pagamento registrado. order_id=%s", order_id)
        return _erro("Este pedido já possui um pagamento registrado.", 400)

    if order.status != OrderStatus.RECEBIDO:
        current_app.logger.warning(
            "Pagamento rejeitado: pedido fora do status esperado. order_id=%s status=%s",
            order_id,
            order.status,
        )
        return jsonify({"success": False, "error": "Pedido não está aguardando pagamento.",
                        "status_code": 409}), 409

    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        current_app.logger.warning("Pagamento rejeitado: corpo JSON inválido para order_id=%s", order_id)
        return jsonify({"success": False, "error": "Corpo deve ser um objeto JSON.",
                        "status_code": 400}), 400

    value = data.get("method")
    method = value.strip().lower() if isinstance(value, str) else ""
    amount = data.get("amount")

    if not method:
        current_app.logger.warning("Pagamento rejeitado: campo method ausente ou vazio. order_id=%s", order_id)
        return jsonify({
            "success": False,
            "error": "O campo 'method' é obrigatório (dinheiro, cartao ou pix).",
            "status_code": 400
        }), 400

    if method not in PaymentMethod.ALL:
        current_app.logger.warning("Pagamento rejeitado: método inválido. order_id=%s method=%s", order_id, method)
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
            current_app.logger.warning("Pagamento rejeitado: valor inválido. order_id=%s amount=%s", order_id, amount)
            return jsonify({
                "success": False,
                "error": "Valor de pagamento inválido.",
                "status_code": 400
            }), 400

    if not amount.is_finite() or amount <= 0 or amount != order.total_amount:
        current_app.logger.warning(
            "Pagamento rejeitado: valor incompatível com o pedido. order_id=%s esperado=%.2f recebido=%s",
            order_id,
            float(order.total_amount),
            str(amount),
        )
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
        current_app.logger.exception("Falha ao persistir pagamento do pedido. order_id=%s", order_id)
        return jsonify({"success": False, "error": "Falha ao registrar pagamento.",
                        "status_code": 500}), 500

    sse_broker.publish("new_order", {"order_id": order.id, **order.to_dict()})

    current_app.logger.info(
        "Pagamento registrado com sucesso. order_id=%s method=%s amount=%.2f",
        order_id,
        method,
        float(amount),
    )

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
