from flask import Blueprint, request, jsonify
from app.models.user import User
from app.utils.auth_decorator import generate_token, jwt_required

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/auth/login", methods=["POST"])
def login():
    """Autenticação de funcionários da equipe (atendente, barista, admin)."""
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({
            "success": False,
            "error": "Usuário e senha são obrigatórios.",
            "status_code": 400
        }), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({
            "success": False,
            "error": "Credenciais inválidas.",
            "status_code": 401
        }), 401

    if not user.is_active:
        return jsonify({
            "success": False,
            "error": "Usuário desativado.",
            "status_code": 403
        }), 403

    token = generate_token(user.id, user.role, user.username)

    return jsonify({
        "success": True,
        "data": {
            "token": token,
            "user": user.to_dict()
        }
    }), 200

@auth_bp.route("/auth/me", methods=["GET"])
@jwt_required
def get_current_user_profile():
    """Retorna os dados do usuário autenticado a partir do token."""
    user_payload = request.current_user
    user = User.query.get(user_payload.get("user_id"))
    if not user:
        return jsonify({
            "success": False,
            "error": "Usuário não encontrado.",
            "status_code": 404
        }), 404

    return jsonify({
        "success": True,
        "data": user.to_dict()
    }), 200
