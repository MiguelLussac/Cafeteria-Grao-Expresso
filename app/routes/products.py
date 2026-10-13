from flask import Blueprint, request, jsonify
from app.extensions import db
from app.models.product import Product
from app.utils.auth_decorator import role_required

products_bp = Blueprint("products", __name__)

VALID_CATEGORIES = ["bebidas", "doces", "salgados"]

@products_bp.route("/products", methods=["GET"])
def list_products():
    """Listar itens do cardápio com suporte a filtro por categoria."""
    category = request.args.get("category")
    active_only = request.args.get("active_only", "true").lower() == "true"

    query = Product.query
    if active_only:
        query = query.filter_by(is_active=True)
    if category:
        query = query.filter_by(category=category.lower())

    products = query.order_by(Product.name).all()
    return jsonify({
        "success": True,
        "count": len(products),
        "data": [p.to_dict() for p in products]
    }), 200

@products_bp.route("/products/<int:product_id>", methods=["GET"])
def get_product(product_id):
    """Buscar detalhes de um produto por ID."""
    product = Product.query.get(product_id)
    if not product:
        return jsonify({
            "success": False,
            "error": "Produto não encontrado.",
            "status_code": 404
        }), 404

    return jsonify({
        "success": True,
        "data": product.to_dict()
    }), 200

@products_bp.route("/products", methods=["POST"])
@role_required("admin", "atendente")
def create_product():
    """Cadastrar novo produto no cardápio."""
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    price = data.get("price")
    category = data.get("category", "").strip().lower()
    description = data.get("description", "").strip()

    if not name or price is None or not category:
        return jsonify({
            "success": False,
            "error": "Campos 'name', 'price' e 'category' são obrigatórios.",
            "status_code": 400
        }), 400

    if category not in VALID_CATEGORIES:
        return jsonify({
            "success": False,
            "error": f"Categoria inválida. Opções: {', '.join(VALID_CATEGORIES)}",
            "status_code": 400
        }), 400

    try:
        price = float(price)
        if price <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({
            "success": False,
            "error": "O preço deve ser um valor numérico positivo.",
            "status_code": 400
        }), 400

    product = Product(
        name=name,
        description=description,
        price=price,
        category=category,
        is_active=True
    )
    db.session.add(product)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Produto criado com sucesso.",
        "data": product.to_dict()
    }), 201

@products_bp.route("/products/<int:product_id>", methods=["PUT"])
@role_required("admin", "atendente")
def update_product(product_id):
    """Atualizar dados de um produto existente."""
    product = Product.query.get(product_id)
    if not product:
        return jsonify({
            "success": False,
            "error": "Produto não encontrado.",
            "status_code": 404
        }), 404

    data = request.get_json(silent=True) or {}
    if "name" in data:
        product.name = data["name"].strip()
    if "description" in data:
        product.description = data["description"].strip()
    if "category" in data:
        cat = data["category"].strip().lower()
        if cat in VALID_CATEGORIES:
            product.category = cat
    if "price" in data:
        try:
            val = float(data["price"])
            if val > 0:
                product.price = val
        except (ValueError, TypeError):
            pass
    if "is_active" in data:
        product.is_active = bool(data["is_active"])

    db.session.commit()
    return jsonify({
        "success": True,
        "message": "Produto atualizado com sucesso.",
        "data": product.to_dict()
    }), 200

@products_bp.route("/products/<int:product_id>", methods=["DELETE"])
@role_required("admin")
def delete_product(product_id):
    """Desativa um produto do cardápio (soft-delete)."""
    product = Product.query.get(product_id)
    if not product:
        return jsonify({
            "success": False,
            "error": "Produto não encontrado.",
            "status_code": 404
        }), 404

    product.is_active = False
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Produto desativado com sucesso."
    }), 200
