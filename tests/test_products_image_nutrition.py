import sqlite3

import pytest
from flask_migrate import downgrade
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app import BASELINE_REVISION, MIGRATIONS_DIR, create_app
from app.config import DevelopmentConfig
from app.extensions import db
from app.models.product import Product

ADMIN = {"X-Role": "admin"}
NUTRITION = {
    "serving_size_g": 200,
    "calories_kcal": 152.25,
    "protein_g": 8,
    "carbs_g": 12.5,
    "fat_g": 7.9,
}
BASE = {"name": "Latte", "price": 12.5, "category": "bebidas"}


@pytest.fixture
def client():
    app = create_app()
    with app.app_context():
        db.session.add(Product(name="Item teste", price=10, category="bebidas"))
        db.session.commit()
    return app.test_client()


def test_produto_sem_imagem_e_sem_tabela_retorna_null(client):
    data = client.get("/api/v1/products/1").json["data"]
    assert data["image_url"] is None and data["nutrition"] is None


def test_cadastro_com_imagem_e_tabela_nutricional(client):
    body = {**BASE, "image_url": " https://cdn.exemplo.com/latte.jpg ", "nutrition": NUTRITION}
    r = client.post("/api/v1/products", json=body, headers=ADMIN)
    assert r.status_code == 201
    data = client.get(f"/api/v1/products/{r.json['data']['id']}").json["data"]
    assert data["image_url"] == "https://cdn.exemplo.com/latte.jpg"
    assert data["nutrition"] == {
        "serving_size_g": 200.0,
        "calories_kcal": 152.3,
        "protein_g": 8.0,
        "carbs_g": 12.5,
        "fat_g": 7.9,
        "source": "manual",
    }


def test_edicao_parcial_adiciona_e_remove_imagem_e_tabela(client):
    r = client.put("/api/v1/products/1", json={"nutrition": {**NUTRITION, "source": "ai"}}, headers=ADMIN)
    assert r.status_code == 200 and r.json["data"]["nutrition"]["source"] == "ai"
    assert r.json["data"]["name"] == "Item teste"

    client.put("/api/v1/products/1", json={"image_url": "http://img.local/a.png"}, headers=ADMIN)
    data = client.get("/api/v1/products/1").json["data"]
    assert data["image_url"] == "http://img.local/a.png" and data["nutrition"] is not None

    r = client.put("/api/v1/products/1", json={"image_url": "", "nutrition": None}, headers=ADMIN)
    assert r.status_code == 200
    assert r.json["data"]["image_url"] is None and r.json["data"]["nutrition"] is None


@pytest.mark.parametrize("image_url", [
    123, "ftp://exemplo.com/a.png", "exemplo.com/a.png", "javascript:alert(1)",
    "https://" + "a" * 500,
])
def test_image_url_invalida_retorna_400(client, image_url):
    r = client.put("/api/v1/products/1", json={"image_url": image_url}, headers=ADMIN)
    assert r.status_code == 400


@pytest.mark.parametrize("nutrition", [
    "200 kcal",
    {"calories_kcal": 100},
    {**NUTRITION, "sugar_g": 3},
    {**NUTRITION, "protein_g": -1},
    {**NUTRITION, "protein_g": "8"},
    {**NUTRITION, "protein_g": True},
    {**NUTRITION, "serving_size_g": 0},
    {**NUTRITION, "calories_kcal": 10001},
    {**NUTRITION, "protein_g": 150, "carbs_g": 60},
    {**NUTRITION, "source": "chute"},
])
def test_tabela_nutricional_invalida_retorna_400_sem_alterar(client, nutrition):
    r = client.put("/api/v1/products/1", json={"nutrition": nutrition}, headers=ADMIN)
    assert r.status_code == 400
    assert client.get("/api/v1/products/1").json["data"]["nutrition"] is None


def test_migracoes_criam_banco_novo(tmp_path, monkeypatch):
    monkeypatch.setattr(DevelopmentConfig, "SQLALCHEMY_DATABASE_URI", f"sqlite:///{tmp_path / 'novo.db'}")
    app = create_app("development")
    with app.app_context():
        columns = {c["name"] for c in inspect(db.engine).get_columns("products")}
        assert {"image_url", "calories_kcal", "nutrition_source"} <= columns
        assert Product.query.count() == 7


def test_migracoes_atualizam_banco_criado_pelo_create_all(tmp_path, monkeypatch):
    path = tmp_path / "antigo.db"
    monkeypatch.setattr(DevelopmentConfig, "SQLALCHEMY_DATABASE_URI", f"sqlite:///{path}")

    # Simula o banco de antes das migrações: schema inicial, sem alembic_version.
    app = create_app("development")
    with app.app_context():
        downgrade(directory=MIGRATIONS_DIR, revision=BASELINE_REVISION)
        db.session.execute(text("DROP TABLE alembic_version"))
        db.session.execute(text("DELETE FROM products"))
        db.session.execute(text(
            "INSERT INTO products (name, price, category, is_active, created_at, updated_at) "
            "VALUES ('Café antigo', 5, 'bebidas', 1, '2026-10-01', '2026-10-01')"
        ))
        db.session.commit()
        assert "image_url" not in {c["name"] for c in inspect(db.engine).get_columns("products")}
        db.engine.dispose()

    app = create_app("development")
    with app.app_context():
        products = Product.query.all()
        assert [p.name for p in products] == ["Café antigo"]
        assert products[0].to_dict()["nutrition"] is None

    con = sqlite3.connect(path)
    assert con.execute("SELECT version_num FROM alembic_version").fetchone()[0] != BASELINE_REVISION
    con.close()


@pytest.mark.parametrize("sql", [
    # Tabela incompleta, macros maiores que a porção e origem desconhecida:
    # o banco recusa mesmo quando a escrita não passa pela API (Edge Function).
    "UPDATE products SET calories_kcal = 100 WHERE id = 1",
    "UPDATE products SET serving_size_g = 10, calories_kcal = 100, protein_g = 8, carbs_g = 8, "
    "fat_g = 0, nutrition_source = 'ai' WHERE id = 1",
    "UPDATE products SET serving_size_g = 100, calories_kcal = 100, protein_g = 1, carbs_g = 1, "
    "fat_g = 1, nutrition_source = 'chute' WHERE id = 1",
])
def test_banco_recusa_tabela_nutricional_invalida(tmp_path, monkeypatch, sql):
    monkeypatch.setattr(DevelopmentConfig, "SQLALCHEMY_DATABASE_URI", f"sqlite:///{tmp_path / 'ck.db'}")
    app = create_app("development")
    with app.app_context():
        with pytest.raises(IntegrityError):
            db.session.execute(text(sql))
            db.session.commit()
        db.session.rollback()
        db.session.execute(text(
            "UPDATE products SET serving_size_g = 100, calories_kcal = 100, protein_g = 1, carbs_g = 1, "
            "fat_g = 1, nutrition_source = 'ai' WHERE id = 1"
        ))
        db.session.commit()
        assert db.session.get(Product, 1).to_dict()["nutrition"]["source"] == "ai"
