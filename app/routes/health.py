from flask import Blueprint, jsonify

health_bp = Blueprint("health", __name__)

@health_bp.route("/health", methods=["GET"])
def health_check():
    """Endpoint de verificação de disponibilidade do backend."""
    return jsonify({
        "status": "healthy",
        "service": "Cafeteria Grao Expresso API",
        "version": "1.0.0"
    }), 200
