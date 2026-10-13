from flask import jsonify

def register_error_handlers(app):
    """Registra manipuladores de erros HTTP padronizados em JSON."""

    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({
            "success": False,
            "error": getattr(error, "description", "Requisição inválida"),
            "status_code": 400
        }), 400

    @app.errorhandler(401)
    def unauthorized(error):
        return jsonify({
            "success": False,
            "error": getattr(error, "description", "Não autorizado"),
            "status_code": 401
        }), 401

    @app.errorhandler(403)
    def forbidden(error):
        return jsonify({
            "success": False,
            "error": getattr(error, "description", "Acesso proibido"),
            "status_code": 403
        }), 403

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            "success": False,
            "error": getattr(error, "description", "Recurso não encontrado"),
            "status_code": 404
        }), 404

    @app.errorhandler(405)
    def method_not_allowed(error):
        return jsonify({
            "success": False,
            "error": "Método HTTP não permitido para esta rota",
            "status_code": 405
        }), 405

    @app.errorhandler(500)
    def internal_server_error(error):
        return jsonify({
            "success": False,
            "error": "Erro interno no servidor",
            "status_code": 500
        }), 500
