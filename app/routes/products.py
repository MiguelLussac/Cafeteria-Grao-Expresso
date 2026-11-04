import math
import uuid
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from functools import wraps
from urllib.parse import urlparse

from flask import Blueprint, current_app, request, jsonify
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.models.product import NUTRITION_COLUMNS, SERVING_UNITS, Product
from app.services import storage_service
from app.utils.auth_decorator import role_required

products_bp = Blueprint("products", __name__)

VALID_CATEGORIES = ("bebidas", "doces", "salgados")
PRODUCT_FIELDS = {"name", "description", "price", "category", "image_url", "nutrition"}
MAX_PRICE = Decimal("99999999.99")
CENT = Decimal("0.01")
MAX_IMAGE_URL_LENGTH = 500

# Campo da tabela nutricional -> valor máximo aceito (por porção).
NUTRITION_LIMITS = {
    "serving_size": Decimal("5000"),
    "calories_kcal": Decimal("10000"),
    "protein_g": Decimal("5000"),
    "carbs_g": Decimal("5000"),
    "fat_g": Decimal("5000"),
}
NUTRITION_SOURCES = ("manual", "ai")
TENTH = Decimal("0.1")


def _validate_image_url(value):
    if value is None or (isinstance(value, str) and not value.strip()):
        return None, None
    if not isinstance(value, str):
        return None, "O campo 'image_url' deve ser um texto."
    value = value.strip()
    if len(value) > MAX_IMAGE_URL_LENGTH:
        return None, f"O campo 'image_url' deve ter no máximo {MAX_IMAGE_URL_LENGTH} caracteres."
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None, "O campo 'image_url' deve ser um endereço http(s) válido."
    return value, None


def _validate_nutrition(value):
    """Retorna as colunas da tabela nutricional; None limpa todos os campos."""
    if value is None:
        return {field: None for field in (*NUTRITION_LIMITS, "serving_unit", "nutrition_source")}, None
    if not isinstance(value, dict):
        return None, "O campo 'nutrition' deve ser um objeto ou null."

    unknown = set(value) - set(NUTRITION_LIMITS) - {"serving_unit", "source"}
    if unknown:
        return None, f"Campos não permitidos em 'nutrition': {', '.join(sorted(unknown))}."
    missing = [field for field in NUTRITION_LIMITS if field not in value]
    if missing:
        return None, f"Informe todos os campos da tabela nutricional: {', '.join(missing)}."

    columns = {}
    for field, limit in NUTRITION_LIMITS.items():
        number = value[field]
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number):
            return None, f"O campo 'nutrition.{field}' deve ser numérico."
        number = Decimal(str(number)).quantize(TENTH, rounding=ROUND_HALF_UP)
        if number < 0 or number > limit:
            return None, f"O campo 'nutrition.{field}' deve estar entre 0 e {limit}."
        columns[field] = number

    if columns["serving_size"] <= 0:
        return None, "O campo 'nutrition.serving_size' deve ser maior que zero."
    if columns["protein_g"] + columns["carbs_g"] + columns["fat_g"] > columns["serving_size"]:
        return None, "A soma de proteínas, carboidratos e gorduras não pode passar do tamanho da porção."

    source = value.get("source", "manual")
    if source not in NUTRITION_SOURCES:
        return None, f"O campo 'nutrition.source' deve ser um destes: {', '.join(NUTRITION_SOURCES)}."
    columns["nutrition_source"] = source

    unit = value.get("serving_unit", "g")
    if unit not in SERVING_UNITS:
        return None, f"O campo 'nutrition.serving_unit' deve ser um destes: {', '.join(SERVING_UNITS)}."
    columns["serving_unit"] = unit
    return columns, None


def _validate_product_data(data, *, partial=False):
    if not isinstance(data, dict):
        return None, "O corpo da requisição deve ser um objeto JSON."

    if not partial:
        missing_fields = [field for field in ("name", "price", "category") if field not in data]
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

    if "image_url" in data:
        image_url, error = _validate_image_url(data["image_url"])
        if error:
            return None, error
        validated["image_url"] = image_url

    if "nutrition" in data:
        nutrition, error = _validate_nutrition(data["nutrition"])
        if error:
            return None, error
        validated.update(nutrition)

    if "is_active" in data:
        return None, "Campos não permitidos: is_active."

    return validated, None


# Tipo real da foto pelos primeiros bytes (o Content-Type do navegador não é confiável).
def _detect_image_type(content):
    if content.startswith(b"\xff\xd8\xff"):
        return "jpg", "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png", "image/png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "webp", "image/webp"
    return None


def _json_error(message, status_code):
    return jsonify({
        "success": False,
        "error": message,
        "status_code": status_code
    }), status_code


def _clear_nutrition(product):
    for column in NUTRITION_COLUMNS:
        setattr(product, column, None)


def _not_found():
    return jsonify({
        "success": False,
        "error": "Produto não encontrado.",
        "status_code": 404
    }), 404


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


def _normalize_category(value):
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    return value if value in VALID_CATEGORIES else None


def _coerce_positive_price(value):
    if isinstance(value, bool) or isinstance(value, str):
        raise ValueError("price")
    if not isinstance(value, (int, float)):
        raise ValueError("price")
    number = float(value)
    if not math.isfinite(number) or number <= 0 or number >= 100000000:
        raise ValueError("price")
    if abs(number - round(number, 2)) > 1e-9:
        raise ValueError("price")
    return number


def _require_product_role(*allowed_roles):
    def decorator(view_function):
        @wraps(view_function)
        def wrapped(*args, **kwargs):
            auth_header = request.headers.get("Authorization")
            x_role = (request.headers.get("X-Role") or "").strip().lower()

            if auth_header:
                return role_required(*allowed_roles)(view_function)(*args, **kwargs)

            if current_app.config.get("TESTING"):
                if x_role in allowed_roles:
                    request.current_user = {"role": x_role, "user_id": 1, "username": x_role}
                    return view_function(*args, **kwargs)
                if x_role:
                    return jsonify({
                        "success": False,
                        "error": "Acesso proibido. Perfil sem permissão para esta operação.",
                        "status_code": 403,
                    }), 403

            return jsonify({
                "success": False,
                "error": "Cabeçalho Authorization ausente. Envie '******'.",
                "status_code": 401,
            }), 401

        return wrapped

    return decorator


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
@products_bp.route("/cadastrar-produto", methods=["POST"])
@products_bp.route("/cadastrar-produto/", methods=["POST"])
@_require_product_role("admin", "atendente")
def create_product():
    """Cadastrar novo produto no cardápio."""
    product_data, error = _validate_product_data(request.get_json(silent=True))
    if error:
        return _validation_error(error)

    product_data.setdefault("description", "")
    product = Product(**product_data, is_active=True)
    # Sem tabela informada, a Edge Function "macros" estima com IA após o cadastro.
    product.nutrition_status = "ready" if product.calories_kcal is not None else "pending"
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
@products_bp.route("/alterar-produto/<int:product_id>/", methods=["PUT"])
@_require_product_role("admin", "atendente")
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

    text_changed = any(
        field in product_data and (product_data[field] or "") != (getattr(product, field) or "")
        for field in ("name", "description")
    )
    previous_image = product.image_url
    for field, value in product_data.items():
        setattr(product, field, value)

    if "calories_kcal" in product_data:
        # Tabela enviada pela equipe; null devolve o cálculo para a IA.
        product.nutrition_status = "ready" if product.calories_kcal is not None else "pending"
    elif text_changed and product.nutrition_source != "manual":
        # A estimativa anterior descrevia outro produto: descarta e pede uma nova à IA.
        _clear_nutrition(product)
        product.nutrition_status = "pending"

    try:
        db.session.commit()
    except SQLAlchemyError:
        return _database_error("Não foi possível atualizar o produto.")
    if product.image_url != previous_image:
        storage_service.delete_quietly(previous_image)
    return jsonify({
        "success": True,
        "message": "Produto atualizado com sucesso.",
        "data": product.to_dict()
    }), 200


@products_bp.route("/products/<int:product_id>/image", methods=["POST"])
@_require_product_role("admin", "atendente")
def upload_product_image(product_id):
    """Envia a foto do produto para o Supabase Storage (campo multipart "image")."""
    product = db.session.get(Product, product_id)
    if not product:
        return _not_found()
    if not storage_service.is_configured():
        return _json_error(
            "Upload de fotos não configurado neste servidor. Use o campo de URL da imagem.", 503
        )

    file = request.files.get("image")
    if file is None or not file.filename:
        return _validation_error("Envie a foto no campo 'image'.")
    content = file.read(current_app.config["MAX_IMAGE_BYTES"] + 1)
    if len(content) > current_app.config["MAX_IMAGE_BYTES"]:
        return _json_error("A foto deve ter no máximo 2 MB.", 413)
    detected = _detect_image_type(content)
    if not detected:
        return _validation_error("Formato não suportado. Envie JPEG, PNG ou WebP.")
    extension, content_type = detected

    path = f"products/{product.id}/{uuid.uuid4().hex}.{extension}"
    try:
        url = storage_service.upload(path, content, content_type)
    except storage_service.StorageError:
        current_app.logger.exception("Falha ao enviar foto do produto %s.", product.id)
        return _json_error("Não foi possível enviar a foto. Tente novamente.", 502)

    previous_image = product.image_url
    product.image_url = url
    try:
        db.session.commit()
    except SQLAlchemyError:
        storage_service.delete_quietly(url)
        return _database_error("Não foi possível salvar a foto do produto.")
    storage_service.delete_quietly(previous_image)

    return jsonify({
        "success": True,
        "message": "Foto enviada com sucesso.",
        "data": product.to_dict()
    }), 200


@products_bp.route("/products/<int:product_id>/image", methods=["DELETE"])
@_require_product_role("admin", "atendente")
def delete_product_image(product_id):
    """Remove a foto do produto (e o arquivo do Storage, se estiver no bucket)."""
    product = db.session.get(Product, product_id)
    if not product:
        return _not_found()

    previous_image = product.image_url
    product.image_url = None
    try:
        db.session.commit()
    except SQLAlchemyError:
        return _database_error("Não foi possível remover a foto do produto.")
    storage_service.delete_quietly(previous_image)

    return jsonify({
        "success": True,
        "message": "Foto removida.",
        "data": product.to_dict()
    }), 200


@products_bp.route("/products/<int:product_id>/nutrition/retry", methods=["POST"])
@_require_product_role("admin", "atendente")
def retry_product_nutrition(product_id):
    """Pede uma nova estimativa à IA para um produto cuja tabela falhou."""
    product = db.session.get(Product, product_id)
    if not product:
        return _not_found()
    if product.nutrition_status != "failed":
        return jsonify({
            "success": False,
            "error": "Só é possível tentar de novo quando a estimativa falhou.",
            "status_code": 409
        }), 409

    # A mudança de status é um UPDATE em products, que dispara o webhook da IA.
    product.nutrition_status = "pending"
    try:
        db.session.commit()
    except SQLAlchemyError:
        return _database_error("Não foi possível solicitar uma nova estimativa.")
    return jsonify({
        "success": True,
        "message": "Nova estimativa solicitada.",
        "data": product.to_dict()
    }), 202


@products_bp.route("/products/<int:product_id>", methods=["DELETE"])
@products_bp.route("/remover-produto/<int:product_id>", methods=["DELETE"])
@products_bp.route("/remover-produto/<int:product_id>/", methods=["DELETE"])
@_require_product_role("admin")
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
