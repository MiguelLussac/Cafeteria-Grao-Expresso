import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()


class Config:
    """Configuração compartilhada; segredos devem vir do ambiente."""
    SECRET_KEY = os.getenv("SECRET_KEY")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    JWT_EXPIRATION_DELTA = timedelta(hours=12)

    database_url = os.getenv("DATABASE_URL", "sqlite:///grao_expresso.db")
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URI = database_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False


class DevelopmentConfig(Config):
    """Configurações para desenvolvimento local."""
    DEBUG = True


class TestingConfig(Config):
    """Configurações de teste isoladas; os segredos abaixo não são de produção."""
    TESTING = True
    DEBUG = True
    SECRET_KEY = os.getenv("SECRET_KEY") or "test-secret-not-for-production"
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or "test-jwt-secret-not-for-production"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


class ProductionConfig(Config):
    """Configurações para produção."""
    DEBUG = False
    TESTING = False


config_by_name = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
