import pytest
from app import create_app
from app.extensions import db

@pytest.fixture
def app():
    """Cria e configura uma instância de aplicação para testes."""
    application = create_app("testing")
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()

@pytest.fixture
def client(app):
    """Cliente de teste Flask."""
    return app.test_client()
