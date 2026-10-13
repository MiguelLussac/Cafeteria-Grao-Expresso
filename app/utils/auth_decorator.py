import jwt
from functools import wraps
from datetime import datetime, timedelta
from flask import request, jsonify, current_app

def generate_token(user_id: int, role: str, username: str) -> str:
    """Gera um token JWT com tempo de expiração definido."""
    secret = current_app.config.get("JWT_SECRET_KEY", "jwt-secret-default")
    expiration = datetime.utcnow() + current_app.config.get("JWT_EXPIRATION_DELTA", timedelta(hours=12))
    
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "username": username,
        "role": role,
        "exp": expiration,
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, secret, algorithm="HS256")

def jwt_required(f):
    """Decorador para proteger rotas exigindo token JWT válido."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return jsonify({
                "success": False,
                "error": "Cabeçalho de autenticação ausente",
                "status_code": 401
            }), 401

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return jsonify({
                "success": False,
                "error": "Formato de token inválido. Use 'Bearer <token>'",
                "status_code": 401
            }), 401

        token = parts[1]
        try:
            secret = current_app.config.get("JWT_SECRET_KEY", "jwt-secret-default")
            payload = jwt.decode(token, secret, algorithms=["HS256"])
            request.current_user = payload
        except jwt.ExpiredSignatureError:
            return jsonify({
                "success": False,
                "error": "Token expirado. Por favor faça login novamente.",
                "status_code": 401
            }), 401
        except jwt.InvalidTokenError:
            return jsonify({
                "success": False,
                "error": "Token inválido.",
                "status_code": 401
            }), 401

        return f(*args, **kwargs)
    return decorated

def role_required(*allowed_roles):
    """Decorador para restringir rotas a papéis específicos (ex: admin, barista, atendente)."""
    def decorator(f):
        @wraps(f)
        @jwt_required
        def decorated_function(*args, **kwargs):
            user = getattr(request, "current_user", None)
            if not user or user.get("role") not in allowed_roles:
                return jsonify({
                    "success": False,
                    "error": f"Acesso proibido. Requer um dos seguintes papéis: {', '.join(allowed_roles)}",
                    "status_code": 403
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator
