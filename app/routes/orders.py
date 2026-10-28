from decimal import Decimal
from flask import Blueprint, request, jsonify
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload

from app.extensions import db
from app.models.order import Order, OrderItem, OrderStatus
from app.models.payment import Payment, PaymentStatus
from app.models.product import Product
from app.services.sse_service import sse_broker
from app.utils.auth_decorator import role_required

orders_bp = Blueprint("orders", __name__)

def _erro(mensagem, status=400):
    return jsonify({
        "success": False,
        "error": mensagem,
        "status_code": status
    }), status


def _texto_opcional(data, campo, padrao=""):
    """Lê um campo de texto opcional. Retorna (valor, erro)."""
    valor = data.get(campo)
    if valor is None:
        return padrao, None
    if not isinstance(valor, str):
        return None, f"O campo '{campo}' deve ser um texto."
    return valor.strip() or padrao, None


@orders_bp.route("/orders", methods=["POST"])
def create_order():
    """Criação de um novo pedido (usado pelo Totem ou pelo Atendente)."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return _erro("Envie um JSON com a lista 'items'.")

    items_data = data.get("items")
    if not items_data or not isinstance(items_data, list):
        return _erro("O pedido deve conter ao menos um item na lista 'items'.")

    customer_name, err = _texto_opcional(data, "customer_name", "Balcão")
    if err:
        return _erro(err)
    table_number, err = _texto_opcional(data, "table_number", "Retirada")
    if err:
        return _erro(err)
    notes, err = _texto_opcional(data, "notes", "")
    if err:
        return _erro(err)

    validated = []
    total = Decimal("0.00")
    for item_input in items_data:
        if not isinstance(item_input, dict):
            return _erro("Cada item deve ser um objeto com 'product_id' e 'quantity'.")

        product_id = item_input.get("product_id")
        quantity = item_input.get("quantity", 1)

        if (isinstance(product_id, bool) or not isinstance(product_id, int) or product_id <= 0
                or isinstance(quantity, bool) or not isinstance(quantity, int) or quantity <= 0):
            return _erro("Cada item deve possuir 'product_id' e 'quantity' inteiros e maiores que 0.")

        product = Product.query.get(product_id)
        if not product or not product.is_active:
            return _erro(f"Produto com ID {product_id} não encontrado ou inativo.")

        unit_price = Decimal(str(product.price)).quantize(Decimal("0.01"))
        total += unit_price * quantity
        validated.append((product.id, quantity, unit_price))

    try:
        order = Order(
            customer_name=customer_name,
            table_number=table_number,
            notes=notes,
            status=OrderStatus.RECEBIDO,
            total_amount=total
        )
        db.session.add(order)
        db.session.flush()

        for product_id, quantity, unit_price in validated:
            db.session.add(OrderItem(
                order_id=order.id,
                product_id=product_id,
                quantity=quantity,
                unit_price=unit_price
            ))
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _erro("Não foi possível registrar o pedido. Nada foi salvo.", 500)

    order_dict = order.to_dict()

    try:
        sse_broker.events.append(("new_order", {
            "order_id": order.id,
            "customer_name": order.customer_name,
            "table_number": order.table_number,
            "status": order.status,
            "total_amount": float(order.total_amount),
            "items_count": len(order.items)
        }))
    except Exception:
        pass

    return jsonify({
        "success": True,
        "message": "Pedido criado com sucesso.",
        "data": order_dict
    }), 201


@orders_bp.route("/orders", methods=["GET"])
def list_orders():
    """Listar pedidos com suporte a filtro por status."""
    status_filter = request.args.get("status")
    limit = request.args.get("limit", 50, type=int)

    query = Order.query
    if status_filter:
        if status_filter not in OrderStatus.ALL:
            return jsonify({
                "success": False,
                "error": f"Status inválido. Permitidos: {', '.join(OrderStatus.ALL)}",
                "status_code": 400
            }), 400
        query = query.filter_by(status=status_filter)

    orders = query.order_by(Order.created_at.desc()).limit(limit).all()

    return jsonify({
        "success": True,
        "count": len(orders),
        "data": [o.to_dict(include_items=False) for o in orders]
    }), 200


@orders_bp.route("/orders/kitchen", methods=["GET"])
@role_required("barista", "atendente", "admin")
def kitchen_queue():
    """Estado completo da fila, inclusive para recuperação após reconexão SSE."""
    status_filter = request.args.get("status")
    if status_filter is not None and status_filter not in OrderStatus.KITCHEN:
        return jsonify({"success": False, "error": "Status inválido para a cozinha.",
                        "status_code": 400}), 400

    query = Order.query.join(Payment).filter(
        Payment.status == PaymentStatus.PAGO,
        Order.status.in_(OrderStatus.KITCHEN),
    ).options(
        selectinload(Order.items).selectinload(OrderItem.product),
        selectinload(Order.payment)
    )
    if status_filter:
        query = query.filter(Order.status == status_filter)
    orders = query.order_by(Payment.paid_at.asc(), Order.id.asc()).all()
    return jsonify({"success": True, "count": len(orders),
                    "data": [order.to_dict() for order in orders]}), 200


@orders_bp.route("/orders/<int:order_id>", methods=["GET"])
def get_order(order_id):
    """Consultar detalhes completos de um pedido pelo ID."""
    order = Order.query.get(order_id)
    if not order:
        return jsonify({
            "success": False,
            "error": "Pedido não encontrado.",
            "status_code": 404
        }), 404

    return jsonify({
        "success": True,
        "data": order.to_dict(include_items=True)
    }), 200


@orders_bp.route("/orders/<int:order_id>/status", methods=["PATCH"])
@role_required("barista", "atendente", "admin")
def update_order_status(order_id):
    """Atualizar o status do pedido (usado pela cozinha/barista)."""
    order = Order.query.get(order_id)
    if not order:
        return jsonify({
            "success": False,
            "error": "Pedido não encontrado.",
            "status_code": 404
        }), 404

    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "error": "Status inválido. Opções válidas: " + ", ".join(OrderStatus.ALL),
            "status_code": 400
        }), 400
    value = data.get("status")
    if not isinstance(value, str):
        return jsonify({
            "success": False,
            "error": "Status inválido. Opções válidas: " + ", ".join(OrderStatus.ALL),
            "status_code": 400
        }), 400
    new_status = value.strip().lower()

    if new_status not in OrderStatus.ALL:
        return jsonify({
            "success": False,
            "error": f"Status inválido. Opções válidas: {', '.join(OrderStatus.ALL)}",
            "status_code": 400
        }), 400

    if new_status not in OrderStatus.TRANSITIONS.get(order.status, set()):
        return jsonify({"success": False, "error": "Transição de status não permitida.",
                        "status_code": 409}), 409

    if new_status != OrderStatus.CANCELADO and (
        not order.payment or order.payment.status != PaymentStatus.PAGO
    ):
        return jsonify({"success": False, "error": "Pedido ainda não foi pago/liberado.",
                        "status_code": 409}), 409

    previous_status = order.status
    try:
        changed = Order.query.filter_by(id=order.id, status=previous_status).update(
            {Order.status: new_status}, synchronize_session=False
        )
        if not changed:
            db.session.rollback()
            return jsonify({"success": False, "error": "Pedido atualizado por outra requisição.",
                            "status_code": 409}), 409
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"success": False, "error": "Falha ao atualizar pedido.",
                        "status_code": 500}), 500

    event_data = {
        "order_id": order.id,
        "customer_name": order.customer_name,
        "table_number": order.table_number,
        "status": order.status,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None
    }

    sse_broker.publish("order_status_updated", event_data)

    if new_status == OrderStatus.PRONTO:
        sse_broker.publish("order_ready", event_data)

    return jsonify({
        "success": True,
        "message": f"Status do pedido alterado para '{new_status}'.",
        "data": {
            "id": order.id,
            "status": order.status,
            "updated_at": order.updated_at.isoformat() if order.updated_at else None
        }
    }), 200
