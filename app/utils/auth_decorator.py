from datetime import datetime, timezone, timedelta
from functools import wraps

import jwt
from flask import current_app, jsonify, request


def _auth_error(message: str, status_code: int = 401):
    return jsonify({
        "success": False,
        "error": message,
        "status_code": status_code,
    }), status_code


def generate_token(user_id: int, role: str, username: str) -> str:
    """Gera um JWT assinado com expiração definida pela configuração do Flask."""
    secret = current_app.config.get("JWT_SECRET_KEY")
    if not secret:
        raise RuntimeError("JWT_SECRET_KEY não foi configurada.")

    now = datetime.now(timezone.utc)
    expiration_delta = current_app.config.get(
        "JWT_EXPIRATION_DELTA", timedelta(hours=12)
    )
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "username": username,
        "role": role,
        "iat": now,
        "exp": now + expiration_delta,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def jwt_required(view_function):
    """Exige JWT válido e um funcionário existente e ativo."""
    @wraps(view_function)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header:
            return _auth_error(
                "Cabeçalho Authorization ausente. Envie 'Bearer <token>'."
            )

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return _auth_error(
                "Formato de autenticação inválido. Use 'Bearer <token>'."
            )

        secret = current_app.config.get("JWT_SECRET_KEY")
        if not secret:
            current_app.logger.error("JWT_SECRET_KEY não foi configurada.")
            return jsonify({
                "success": False,
                "error": "Autenticação indisponível por erro de configuração.",
                "status_code": 500,
            }), 500

        try:
            payload = jwt.decode(
                parts[1],
                secret,
                algorithms=["HS256"],
                options={"require": ["exp", "iat", "sub", "user_id", "role"]},
            )
        except jwt.ExpiredSignatureError:
            return _auth_error("Token expirado. Faça login novamente.")
        except jwt.InvalidTokenError:
            return _auth_error("Token inválido.")

        user_id = payload.get("user_id")
        if not isinstance(user_id, int) or isinstance(user_id, bool):
            return _auth_error("Token inválido.")

        # Revalida o funcionário a cada requisição, respeitando desativação e
        # alterações de perfil feitas depois da emissão do token.
        from app.extensions import db
        from app.models.user import User

        user = db.session.get(User, user_id)
        if user is None or not user.is_active:
            return _auth_error("Usuário inexistente ou desativado. Faça login novamente.")

        payload["username"] = user.username
        payload["role"] = user.role
        request.current_user = payload
        return view_function(*args, **kwargs)

    return decorated


def role_required(*allowed_roles):
    """Exige JWT válido e um dos perfis informados para a operação."""
    def decorator(view_function):
        @wraps(view_function)
        @jwt_required
        def decorated_function(*args, **kwargs):
            user = getattr(request, "current_user", None)
            if not user or user.get("role") not in allowed_roles:
                return jsonify({
                    "success": False,
                    "error": "Acesso proibido. Perfil sem permissão para esta operação.",
                    "status_code": 403,
                }), 403
            return view_function(*args, **kwargs)

        return decorated_function

    return decorator
