import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Configurações base."""
    SECRET_KEY = os.getenv("SECRET_KEY", "grao-expresso-secret-key-2026")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "jwt-super-secret-key-grao-expresso")
    JWT_EXPIRATION_DELTA = timedelta(hours=12)
    
    # Suporte tanto para SQLite (dev) quanto para MySQL (produção no Render)
    database_url = os.getenv("DATABASE_URL", "sqlite:///grao_expresso.db")
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URI = database_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False

class DevelopmentConfig(Config):
    """Configurações de desenvolvimento local."""
    DEBUG = True

class TestingConfig(Config):
    """Configurações de teste com banco em memória."""
    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"

class ProductionConfig(Config):
    """Configurações de produção (Render / Cloud)."""
    DEBUG = False
    TESTING = False

config_by_name = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig
}
