import os
import secrets

from flask import Flask

from app.config import config_by_name
from app.extensions import cors, db, migrate
from app.utils.error_handlers import register_error_handlers
from app.routes import (
    auth_bp,
    events_bp,
    health_bp,
    orders_bp,
    payments_bp,
    products_bp,
)


def create_app(config_name=None):
    """Cria e configura a aplicação Flask."""
    if not config_name:
        config_name = os.getenv("FLASK_ENV", "development").lower()
    config_name = str(config_name).lower()

    app = Flask(__name__)
    app.config.from_object(config_by_name.get(config_name, config_by_name["default"]))

    weak_examples = {
        "sua-chave-secreta-forte-aqui",
        "sua-chave-jwt-super-secreta-aqui",
        "grao-expresso-secret-key-2026",
        "jwt-super-secret-key-grao-expresso",
    }
    if config_name == "production":
        for setting in ("SECRET_KEY", "JWT_SECRET_KEY"):
            value = app.config.get(setting)
            if not isinstance(value, str) or len(value) < 32 or value in weak_examples:
                raise RuntimeError(
                    f"{setting} precisa ser definida com um segredo aleatório de pelo menos 32 caracteres em produção."
                )
        if app.config["SECRET_KEY"] == app.config["JWT_SECRET_KEY"]:
            raise RuntimeError("SECRET_KEY e JWT_SECRET_KEY devem ser diferentes em produção.")
    else:
        # Chaves aleatórias temporárias permitem rodar localmente sem segredos
        # fixos no código. Ao reiniciar, tokens de desenvolvimento deixam de valer.
        for setting in ("SECRET_KEY", "JWT_SECRET_KEY"):
            value = app.config.get(setting)
            if not value or value in weak_examples:
                app.config[setting] = secrets.token_urlsafe(48)

    db.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})
    register_error_handlers(app)

    app.register_blueprint(health_bp, url_prefix="/api/v1")
    app.register_blueprint(auth_bp, url_prefix="/api/v1")
    app.register_blueprint(products_bp, url_prefix="/api/v1")
    app.register_blueprint(orders_bp, url_prefix="/api/v1")
    app.register_blueprint(payments_bp, url_prefix="/api/v1")
    app.register_blueprint(events_bp, url_prefix="/api/v1")

    with app.app_context():
        db.create_all()
        # Usuários e produtos de demonstração só existem em desenvolvimento/teste.
        # Nunca crie credenciais conhecidas automaticamente em produção.
        if config_name in {"development", "testing"}:
            _seed_initial_data()

    return app


def _seed_initial_data():
    """Carrega funcionários e produtos de demonstração no ambiente local/teste."""
    from app.models.product import Product
    from app.models.user import User

    if User.query.count() == 0:
        admin = User(username="admin", role="admin")
        admin.set_password("admin123")
        atendente = User(username="atendente", role="atendente")
        atendente.set_password("atendente123")
        barista = User(username="barista", role="barista")
        barista.set_password("barista123")
        db.session.add_all([admin, atendente, barista])
        db.session.commit()

    if Product.query.count() == 0:
        demo_products = [
            Product(
                name="Café Expresso Tradicional",
                description="Expresso curto 50ml, blend especial de grãos 100% arábica",
                price=6.50,
                category="bebidas",
            ),
            Product(
                name="Capuccino Italiano",
                description="Café expresso, leite vaporizado, crema e toque de canela",
                price=11.00,
                category="bebidas",
            ),
            Product(
                name="Latte Caramelo",
                description="Dose de expresso com bastante leite vaporizado e calda de caramelo artesanal",
                price=13.50,
                category="bebidas",
            ),
            Product(
                name="Pão de Queijo Mineiro",
                description="Pão de queijo quentinho com legítimo queijo canastra (unidade)",
                price=7.00,
                category="salgados",
            ),
            Product(
                name="Croissant de Queijo e Presunto",
                description="Massa folhada amanteigada, queijo gouda e presunto royale",
                price=14.00,
                category="salgados",
            ),
            Product(
                name="Fatia de Bolo de Cenoura",
                description="Bolo fofinho de cenoura com farta cobertura de chocolate belga",
                price=9.50,
                category="doces",
            ),
            Product(
                name="Cookie Recheado de Nutella",
                description="Cookie crocante por fora e recheio cremoso",
                price=8.00,
                category="doces",
            ),
        ]
        db.session.add_all(demo_products)
        db.session.commit()
