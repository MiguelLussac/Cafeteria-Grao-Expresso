from flask import Blueprint, request, jsonify
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload
from app.extensions import db
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.payment import Payment, PaymentStatus
from app.services.sse_service import sse_broker
from app.utils.auth_decorator import role_required

orders_bp = Blueprint("orders", __name__)

@orders_bp.route("/orders", methods=["POST"])
def create_order():
    """Criação de um novo pedido (usado pelo Totem ou pelo Atendente)."""
    data = request.get_json(silent=True) or {}
    items_data = data.get("items", [])

    if not items_data or not isinstance(items_data, list):
        return jsonify({
            "success": False,
            "error": "O pedido deve conter ao menos um item na lista 'items'.",
            "status_code": 400
        }), 400

    order = Order(
        customer_name=data.get("customer_name", "").strip() or "Balcão",
        table_number=data.get("table_number", "").strip() or "Retirada",
        notes=data.get("notes", "").strip(),
        status=OrderStatus.RECEBIDO,
        total_amount=0.00
    )
    db.session.add(order)
    db.session.flush()

    total = 0.00
    for item_input in items_data:
        product_id = item_input.get("product_id")
        quantity = item_input.get("quantity", 1)

        if not product_id or quantity <= 0:
            db.session.rollback()
            return jsonify({
                "success": False,
                "error": "Cada item deve possuir 'product_id' e 'quantity' maior que 0.",
                "status_code": 400
            }), 400

        product = Product.query.get(product_id)
        if not product or not product.is_active:
            db.session.rollback()
            return jsonify({
                "success": False,
                "error": f"Produto com ID {product_id} não encontrado ou inativo.",
                "status_code": 400
            }), 400

        unit_price = float(product.price)
        subtotal = unit_price * quantity
        total += subtotal

        order_item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=quantity,
            unit_price=unit_price
        )
        db.session.add(order_item)

    order.total_amount = round(total, 2)
    db.session.commit()

    order_dict = order.to_dict()

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
    ).options(selectinload(Order.items).selectinload(OrderItem.product),
              selectinload(Order.payment))
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
    value = data.get("status") if isinstance(data, dict) else None
    new_status = value.strip().lower() if isinstance(value, str) else ""

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

    # Compare-and-set evita dois avanços concorrentes a partir do mesmo estado.
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

    # Dispara evento em tempo real para os ouvintes SSE
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
