import os
from flask import Flask
from app.config import config_by_name
from app.extensions import db, migrate, cors
from app.utils.error_handlers import register_error_handlers
from app.routes import (
    health_bp,
    auth_bp,
    products_bp,
    orders_bp,
    payments_bp,
    events_bp
)

def create_app(config_name=None):
    """Factory para criação e inicialização do app Flask."""
    if not config_name:
        config_name = os.getenv("FLASK_ENV", "development").lower()

    app = Flask(__name__)
    app.config.from_object(config_by_name.get(config_name, config_by_name["default"]))

    # Inicializa extensões
    db.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    # Registra handlers de erro HTTP
    register_error_handlers(app)

    # Registra Blueprints com prefixo da API /api/v1
    app.register_blueprint(health_bp, url_prefix="/api/v1")
    app.register_blueprint(auth_bp, url_prefix="/api/v1")
    app.register_blueprint(products_bp, url_prefix="/api/v1")
    app.register_blueprint(orders_bp, url_prefix="/api/v1")
    app.register_blueprint(payments_bp, url_prefix="/api/v1")
    app.register_blueprint(events_bp, url_prefix="/api/v1")

    # Inicialização das tabelas e carga semente (se em desenvolvimento ou teste)
    with app.app_context():
        db.create_all()
        _seed_initial_data()

    return app

def _seed_initial_data():
    """Popula dados iniciais essenciais para teste e demonstração rápida."""
    from app.models.user import User
    from app.models.product import Product

    # Cria usuários padrão se a tabela de usuários estiver vazia
    if User.query.count() == 0:
        admin = User(username="admin", role="admin")
        admin.set_password("admin123")

        atendente = User(username="atendente", role="atendente")
        atendente.set_password("atendente123")

        barista = User(username="barista", role="barista")
        barista.set_password("barista123")

        db.session.add_all([admin, atendente, barista])
        db.session.commit()

    # Cria produtos de demonstração do cardápio se a tabela de produtos estiver vazia
    if Product.query.count() == 0:
        demo_products = [
            Product(
                name="Café Expresso Tradicional",
                description="Expresso curto 50ml, blend especial de grãos 100% arábica",
                price=6.50,
                category="bebidas"
            ),
            Product(
                name="Capuccino Italiano",
                description="Café expresso, leite vaporizado, crema e toque de canela",
                price=11.00,
                category="bebidas"
            ),
            Product(
                name="Latte Caramelo",
                description="Dose de expresso com bastante leite vaporizado e calda de caramelo artesanal",
                price=13.50,
                category="bebidas"
            ),
            Product(
                name="Pão de Queijo Mineiro",
                description="Pão de queijo quentinho com legítimo queijo canastra (unidade)",
                price=7.00,
                category="salgados"
            ),
            Product(
                name="Croissant de Queijo e Presunto",
                description="Massa folhada amanteigada, queijo gouda e presunto royale",
                price=14.00,
                category="salgados"
            ),
            Product(
                name="Fatia de Bolo de Cenoura",
                description="Bolo fofinho de cenoura com farta cobertura de chocolate belga",
                price=9.50,
                category="doces"
            ),
            Product(
                name="Cookie Recheado de Nutella",
                description="Cookie crocante por fora e recheio cremoso",
                price=8.00,
                category="doces"
            ),
        ]
        db.session.add_all(demo_products)
        db.session.commit()
