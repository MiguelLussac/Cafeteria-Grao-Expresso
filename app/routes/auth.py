from datetime import timedelta

from flask import Blueprint, current_app, jsonify, request

from app.models.user import User
from app.utils.auth_decorator import generate_token, jwt_required

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/auth/login", methods=["POST"])
def login():
    """Autentica um funcionário e devolve um JWT."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "error": "Envie um objeto JSON com usuário e senha.",
            "status_code": 400,
        }), 400

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip() or not isinstance(password, str) or not password:
        return jsonify({
            "success": False,
            "error": "Usuário e senha são obrigatórios.",
            "status_code": 400,
        }), 400

    user = User.query.filter_by(username=username.strip()).first()
    if user is None or not user.check_password(password):
        return jsonify({
            "success": False,
            "error": "Credenciais inválidas.",
            "status_code": 401,
        }), 401

    if not user.is_active:
        return jsonify({
            "success": False,
            "error": "Usuário desativado.",
            "status_code": 403,
        }), 403

    token = generate_token(user.id, user.role, user.username)
    return jsonify({
        "success": True,
        "data": {
            "token": token,
            "token_type": "Bearer",
            "expires_in": int(
                current_app.config.get("JWT_EXPIRATION_DELTA", timedelta(hours=12)).total_seconds()
            ),
            "user": user.to_dict(),
        },
    }), 200


@auth_bp.route("/auth/me", methods=["GET"])
@jwt_required
def get_current_user_profile():
    """Retorna o perfil do funcionário autenticado."""
    user_payload = request.current_user
    user = User.query.filter_by(id=user_payload["user_id"]).first()
    if user is None:
        return jsonify({
            "success": False,
            "error": "Usuário não encontrado.",
            "status_code": 404,
        }), 404

    return jsonify({
        "success": True,
        "data": user.to_dict(),
    }), 200
