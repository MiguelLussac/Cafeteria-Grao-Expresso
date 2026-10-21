from decimal import Decimal, InvalidOperation

from flask import Blueprint, current_app, request, jsonify
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.models.product import Product
from app.utils.auth_decorator import role_required

products_bp = Blueprint("products", __name__)

VALID_CATEGORIES = ("bebidas", "doces", "salgados")
PRODUCT_FIELDS = {"name", "description", "price", "category", "is_active"}
MAX_PRICE = Decimal("99999999.99")
CENT = Decimal("0.01")


def _validate_product_data(data, *, partial=False):
    if not isinstance(data, dict):
        return None, "O corpo da requisição deve ser um objeto JSON."

    if not partial:
        missing_fields = [
            field for field in ("name", "price", "category")
            if field not in data
        ]
        if missing_fields:
            return None, "Campos 'name', 'price' e 'category' são obrigatórios."
    elif not PRODUCT_FIELDS.intersection(data):
        return None, "Informe ao menos um campo válido para atualizar."

    validated = {}

    if "name" in data or not partial:
        name = data.get("name")
        if not isinstance(name, str) or not name.strip():
            return None, "O campo 'name' deve ser um texto não vazio."
        name = name.strip()
        if len(name) > 120:
            return None, "O campo 'name' deve ter no máximo 120 caracteres."
        validated["name"] = name

    if "price" in data or not partial:
        price = data.get("price")
        if isinstance(price, bool) or not isinstance(price, (int, float)):
            return None, "O preço deve ser um valor numérico positivo com até duas casas decimais."
        try:
            price = Decimal(str(price))
        except (InvalidOperation, ValueError):
            return None, "O preço deve ser um valor numérico positivo com até duas casas decimais."
        if (
            not price.is_finite()
            or price <= 0
            or price > MAX_PRICE
            or price != price.quantize(CENT)
        ):
            return None, "O preço deve ser um valor numérico positivo com até duas casas decimais."
        validated["price"] = price

    if "category" in data or not partial:
        category = data.get("category")
        if not isinstance(category, str):
            return None, "O campo 'category' deve ser um texto."
        category = category.strip().lower()
        if category not in VALID_CATEGORIES:
            return None, f"Categoria inválida. Opções: {', '.join(VALID_CATEGORIES)}"
        validated["category"] = category

    if "description" in data:
        description = data["description"]
        if description is not None and not isinstance(description, str):
            return None, "O campo 'description' deve ser um texto."
        validated["description"] = description.strip() if description else ""

    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            return None, "O campo 'is_active' deve ser booleano."
        validated["is_active"] = data["is_active"]

    return validated, None


def _validation_error(message):
    return jsonify({
        "success": False,
        "error": message,
        "status_code": 400
    }), 400


def _database_error(message):
    current_app.logger.exception("Falha ao salvar produto no banco de dados.")
    db.session.rollback()
    return jsonify({
        "success": False,
        "error": message,
        "status_code": 500
    }), 500

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
@products_bp.route("/cadastrar-produto/", methods=["POST"])
@role_required("admin", "atendente")
def create_product():
    """Cadastrar novo produto no cardápio."""
    product_data, error = _validate_product_data(request.get_json(silent=True))
    if error:
        return _validation_error(error)

    product = Product(
        name=product_data["name"],
        description=product_data.get("description", ""),
        price=product_data["price"],
        category=product_data["category"],
        is_active=True
    )
    try:
        db.session.add(product)
        db.session.commit()
    except SQLAlchemyError:
        return _database_error("Não foi possível cadastrar o produto.")

    return jsonify({
        "success": True,
        "message": "Produto criado com sucesso.",
        "data": product.to_dict()
    }), 201

@products_bp.route("/products/<int:product_id>", methods=["PUT"])
@products_bp.route("/alterar-produto/<int:product_id>", methods=["PUT"])
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

    product_data, error = _validate_product_data(
        request.get_json(silent=True),
        partial=True
    )
    if error:
        return _validation_error(error)

    for field, value in product_data.items():
        setattr(product, field, value)

    try:
        db.session.commit()
    except SQLAlchemyError:
        return _database_error("Não foi possível atualizar o produto.")
    return jsonify({
        "success": True,
        "message": "Produto atualizado com sucesso.",
        "data": product.to_dict()
    }), 200

@products_bp.route("/products/<int:product_id>", methods=["DELETE"])
@products_bp.route("/remover-produto/<int:product_id>", methods=["DELETE"])
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
    try:
        db.session.commit()
    except SQLAlchemyError:
        return _database_error("Não foi possível desativar o produto.")

    return jsonify({
        "success": True,
        "message": "Produto desativado com sucesso."
    }), 200
