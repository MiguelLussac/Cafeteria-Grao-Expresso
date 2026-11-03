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
    "serving_size": 200,
    "calories_kcal": 152.25,
    "protein_g": 8,
    "carbs_g": 12.5,
    "fat_g": 7.9,
}
BASE = {"name": "Latte", "price": 12.5, "category": "bebidas"}
VALID_ROW = (
    "serving_size = 100, serving_unit = 'ml', calories_kcal = 100, protein_g = 1, carbs_g = 8, "
    "fat_g = 1, nutrition_source = 'ai', nutrition_status = 'ready'"
)


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
    assert data["nutrition_status"] == "ready"
    assert data["nutrition"] == {
        "serving_size": 200.0,
        "serving_unit": "g",
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
    {**NUTRITION, "serving_size": 0},
    {**NUTRITION, "serving_unit": "kg"},
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
        assert {"image_url", "serving_size", "serving_unit", "nutrition_status"} <= columns
        assert {p.nutrition_status for p in Product.query} == {"pending"}
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
        assert products[0].nutrition_status == "pending"

    con = sqlite3.connect(path)
    assert con.execute("SELECT version_num FROM alembic_version").fetchone()[0] != BASELINE_REVISION
    con.close()


@pytest.mark.parametrize("sql", [
    # Tabela incompleta, macros maiores que a porção e origem desconhecida:
    # o banco recusa mesmo quando a escrita não passa pela API (Edge Function).
    "UPDATE products SET calories_kcal = 100 WHERE id = 1",
    "UPDATE products SET " + VALID_ROW.replace("serving_size = 100", "serving_size = 5") + " WHERE id = 1",
    "UPDATE products SET " + VALID_ROW.replace("source = 'ai'", "source = 'chute'") + " WHERE id = 1",
    "UPDATE products SET " + VALID_ROW.replace("unit = 'ml'", "unit = 'kg'") + " WHERE id = 1",
    # Status "ready" sem tabela e tabela com status "pending".
    "UPDATE products SET nutrition_status = 'ready' WHERE id = 1",
    "UPDATE products SET " + VALID_ROW.replace("'ready'", "'pending'") + " WHERE id = 1",
])
def test_banco_recusa_tabela_nutricional_invalida(tmp_path, monkeypatch, sql):
    monkeypatch.setattr(DevelopmentConfig, "SQLALCHEMY_DATABASE_URI", f"sqlite:///{tmp_path / 'ck.db'}")
    app = create_app("development")
    with app.app_context():
        with pytest.raises(IntegrityError):
            db.session.execute(text(sql))
            db.session.commit()
        db.session.rollback()
        db.session.execute(text(f"UPDATE products SET {VALID_ROW} WHERE id = 1"))
        db.session.commit()
        assert db.session.get(Product, 1).to_dict()["nutrition"]["source"] == "ai"


def _set_ai_nutrition(product_id=1):
    db.session.execute(text(f"UPDATE products SET {VALID_ROW} WHERE id = :id"), {"id": product_id})
    db.session.commit()


def test_cadastro_sem_tabela_fica_aguardando_a_ia(client):
    r = client.post("/api/v1/products", json=BASE, headers=ADMIN)
    assert r.json["data"]["nutrition_status"] == "pending" and r.json["data"]["nutrition"] is None


def test_mudar_nome_descarta_estimativa_da_ia_mas_nao_a_manual():
    app = create_app()
    with app.app_context():
        db.session.add_all([
            Product(name="Latte", description="Leite", price=10, category="bebidas"),
            Product(name="Mocha", price=12, category="bebidas"),
        ])
        db.session.commit()
        _set_ai_nutrition(1)
    client = app.test_client()
    client.put("/api/v1/products/2", json={"nutrition": NUTRITION}, headers=ADMIN)

    # Preço não muda a estimativa; nome e descrição sim.
    data = client.put("/api/v1/products/1", json={"price": 11}, headers=ADMIN).json["data"]
    assert data["nutrition_status"] == "ready" and data["nutrition"]["serving_unit"] == "ml"
    data = client.put("/api/v1/products/1", json={"description": "Leite e canela"}, headers=ADMIN).json["data"]
    assert data["nutrition_status"] == "pending" and data["nutrition"] is None

    data = client.put("/api/v1/products/2", json={"name": "Mocha grande"}, headers=ADMIN).json["data"]
    assert data["nutrition_status"] == "ready" and data["nutrition"]["source"] == "manual"


def test_remover_tabela_manual_devolve_o_calculo_para_a_ia(client):
    client.put("/api/v1/products/1", json={"nutrition": NUTRITION}, headers=ADMIN)
    data = client.put("/api/v1/products/1", json={"nutrition": None}, headers=ADMIN).json["data"]
    assert data["nutrition_status"] == "pending" and data["nutrition"] is None


def test_tentar_de_novo_so_quando_a_estimativa_falhou():
    app = create_app()
    with app.app_context():
        db.session.add(Product(name="Chá", price=8, category="bebidas", nutrition_status="failed"))
        db.session.add(Product(name="Café", price=6, category="bebidas"))
        db.session.commit()
    client = app.test_client()

    r = client.post("/api/v1/products/1/nutrition/retry", headers=ADMIN)
    assert r.status_code == 202 and r.json["data"]["nutrition_status"] == "pending"
    assert client.post("/api/v1/products/1/nutrition/retry", headers=ADMIN).status_code == 409
    assert client.post("/api/v1/products/2/nutrition/retry", headers=ADMIN).status_code == 409
    assert client.post("/api/v1/products/99/nutrition/retry", headers=ADMIN).status_code == 404
    assert client.post("/api/v1/products/1/nutrition/retry", headers={"X-Role": "barista"}).status_code == 403


def test_itens_do_pedido_trazem_a_tabela_nutricional():
    app = create_app()
    with app.app_context():
        db.session.add(Product(name="Latte", price=10, category="bebidas"))
        db.session.commit()
        _set_ai_nutrition(1)
    client = app.test_client()
    r = client.post("/api/v1/orders", json={
        "items": [{"product_id": 1, "quantity": 2}], "customer_name": "Ana", "table_number": "Mesa",
    })
    assert r.status_code == 201, r.json
    item = client.get(f"/api/v1/orders/{r.json['data']['id']}").json["data"]["items"][0]
    assert item["nutrition"]["calories_kcal"] == 100.0 and item["nutrition"]["serving_unit"] == "ml"
