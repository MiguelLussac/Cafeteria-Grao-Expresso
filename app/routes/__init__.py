from app.routes.health import health_bp
from app.routes.auth import auth_bp
from app.routes.products import products_bp
from app.routes.orders import orders_bp
from app.routes.payments import payments_bp
from app.routes.events import events_bp

__all__ = [
    "health_bp",
    "auth_bp",
    "products_bp",
    "orders_bp",
    "payments_bp",
    "events_bp"
]
