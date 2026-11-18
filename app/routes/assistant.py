from flask import Blueprint, current_app, jsonify, request

from app.models.product import Product
from app.services import assistant_service

assistant_bp = Blueprint("assistant", __name__)

MAX_MESSAGES = 30
MAX_MESSAGE_CHARS = 500
VALID_ROLES = {"user", "assistant"}
UNAVAILABLE_MESSAGE = "O assistente está indisponível no momento. Use o cardápio para fazer seu pedido."
FAILURE_MESSAGE = "O assistente não conseguiu responder agora. Tente de novo ou use o cardápio."


def _erro(mensagem, status=400):
    return jsonify({"success": False, "error": mensagem, "status_code": status}), status


def _validar_mensagens(messages):
    if not isinstance(messages, list) or not messages:
        return None, "O campo 'messages' deve ser uma lista com ao menos uma mensagem."
    if len(messages) > MAX_MESSAGES:
        return None, "A conversa ficou longa demais. Revise o pedido ou comece uma nova conversa."
    validated = []
    for message in messages:
        if not isinstance(message, dict) or message.get("role") not in VALID_ROLES:
            return None, "Cada mensagem deve ter 'role' ('user' ou 'assistant') e 'content'."
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            return None, "As mensagens não podem estar vazias."
        if len(content) > MAX_MESSAGE_CHARS and message["role"] == "user":
            return None, f"Cada mensagem pode ter no máximo {MAX_MESSAGE_CHARS} caracteres."
        validated.append({"role": message["role"], "content": content.strip()[:2000]})
    if validated[-1]["role"] != "user":
        return None, "A última mensagem da conversa deve ser do cliente."
    return validated, None


@assistant_bp.route("/assistant/chat", methods=["POST"])
def assistant_chat():
    """Uma rodada da conversa do totem: recebe o histórico e devolve resposta e carrinho."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return _erro("Envie um JSON com 'messages' e, opcionalmente, 'cart'.")

    messages, error = _validar_mensagens(data.get("messages"))
    if error:
        return _erro(error)

    cart = data.get("cart", [])
    if not isinstance(cart, list):
        return _erro("O campo 'cart' deve ser uma lista.")

    products = Product.query.filter_by(is_active=True).order_by(Product.category, Product.name).all()
    try:
        result = assistant_service.chat(messages, cart, products)
    except assistant_service.AssistantUnavailable:
        current_app.logger.warning("Assistente do totem chamado sem GEMINI_API_KEY configurada.")
        return _erro(UNAVAILABLE_MESSAGE, 503)
    except assistant_service.AssistantError as exc:
        current_app.logger.error("Falha no assistente do totem: %s", exc)
        return _erro(FAILURE_MESSAGE, 502)

    return jsonify({"success": True, "data": result}), 200
