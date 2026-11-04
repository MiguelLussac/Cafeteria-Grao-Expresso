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
    # O pooler do Supabase encerra conexões ociosas; o pre_ping evita erro
    # ao reutilizar uma conexão que já foi fechada do outro lado.
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "hide_parameters": True}
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False

    # Fotos dos produtos no Supabase Storage. Sem URL e chave, o upload fica
    # desativado e só o campo de URL da imagem funciona.
    SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/") or None
    # Chave secreta (service role): acesso total ao projeto, só no servidor.
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or None
    SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "produtos")
    # Fotos chegam reduzidas pelo navegador; o bucket aceita até 2 MB.
    MAX_IMAGE_BYTES = 2 * 1024 * 1024
    MAX_CONTENT_LENGTH = 3 * 1024 * 1024


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
    # Testes nunca enviam arquivos ao Storage real (ver tests com monkeypatch).
    SUPABASE_URL = None
    SUPABASE_SERVICE_ROLE_KEY = None


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
