import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.models.product import Product


@pytest.fixture
def product_headers(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "atendente", "password": "atendente123"},
    )
    token = response.get_json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    token = response.get_json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize(
    "path",
    ["/api/v1/products", "/api/v1/cadastrar-produto/"],
)
def test_create_product_persists_and_can_be_retrieved(client, product_headers, path):
    response = client.post(
        path,
        json={
            "name": "  Cappuccino da casa  ",
            "price": 12.50,
            "category": " BEBIDAS ",
            "description": "Com canela",
        },
        headers=product_headers,
    )

    assert response.status_code == 201
    created = response.get_json()
    assert created["success"] is True
    assert created["data"]["name"] == "Cappuccino da casa"
    assert created["data"]["price"] == 12.5
    assert created["data"]["category"] == "bebidas"

    product_id = created["data"]["id"]
    fetched = client.get(f"/api/v1/products/{product_id}")
    assert fetched.status_code == 200
    assert fetched.get_json()["data"]["name"] == "Cappuccino da casa"
    assert db.session.get(Product, product_id) is not None


@pytest.mark.parametrize(
    "payload",
    [
        {"price": 5.00, "category": "bebidas"},
        {"name": "Produto", "category": "bebidas"},
        {"name": "Produto", "price": 5.00},
    ],
)
def test_create_product_rejects_missing_required_fields(
    client, product_headers, payload
):
    response = client.post(
        "/api/v1/products",
        json=payload,
        headers=product_headers,
    )

    assert response.status_code == 400
    assert response.get_json()["success"] is False
    assert response.get_json()["status_code"] == 400


@pytest.mark.parametrize(
    "price",
    [0, -1, "invalido", "12.50", True, float("nan"), float("inf"), 1.001, 100000000],
)
def test_create_product_rejects_invalid_prices(client, product_headers, price):
    response = client.post(
        "/api/v1/products",
        json={"name": "Produto", "price": price, "category": "bebidas"},
        headers=product_headers,
    )

    assert response.status_code == 400
    assert response.get_json()["success"] is False
    assert "preço" in response.get_json()["error"].lower()


def test_create_product_rejects_invalid_category(client, product_headers):
    response = client.post(
        "/api/v1/products",
        json={"name": "Produto", "price": 5, "category": "outros"},
        headers=product_headers,
    )

    assert response.status_code == 400
    assert "Categoria inválida" in response.get_json()["error"]


@pytest.mark.parametrize(
    "body",
    [
        {"json": []},
        {"data": "{", "content_type": "application/json"},
    ],
)
def test_create_product_rejects_non_object_or_malformed_json(
    client, product_headers, body
):
    response = client.post(
        "/api/v1/products",
        headers=product_headers,
        **body,
    )

    assert response.status_code == 400
    assert response.get_json()["success"] is False


@pytest.mark.parametrize(
    "payload",
    [
        {"name": " "},
        {"price": 0},
        {"category": "outros"},
    ],
)
def test_update_product_uses_the_same_validation_rules(
    client, product_headers, payload
):
    response = client.put(
        "/api/v1/products/1",
        json=payload,
        headers=product_headers,
    )

    assert response.status_code == 400
    assert response.get_json()["success"] is False


@pytest.mark.parametrize(
    "path",
    ["/api/v1/products/1", "/api/v1/alterar-produto/1"],
)
def test_update_product_persists_and_can_be_retrieved(
    client, product_headers, path
):
    response = client.put(
        path,
        json={"name": "Expresso atualizado", "price": 8.75, "category": "doces"},
        headers=product_headers,
    )

    assert response.status_code == 200
    assert response.get_json()["data"]["name"] == "Expresso atualizado"
    assert response.get_json()["data"]["price"] == 8.75

    fetched = client.get("/api/v1/products/1")
    assert fetched.status_code == 200
    assert fetched.get_json()["data"]["category"] == "doces"


@pytest.mark.parametrize(
    "path",
    ["/api/v1/products/99999", "/api/v1/alterar-produto/99999"],
)
def test_update_product_returns_not_found(client, product_headers, path):
    response = client.put(
        path,
        json={"name": "Produto inexistente"},
        headers=product_headers,
    )

    assert response.status_code == 404
    assert response.get_json() == {
        "success": False,
        "error": "Produto não encontrado.",
        "status_code": 404,
    }


@pytest.mark.parametrize(
    "path",
    ["/api/v1/products/1", "/api/v1/remover-produto/1"],
)
def test_delete_product_deactivates_and_hides_from_default_list(
    client, admin_headers, path
):
    response = client.delete(path, headers=admin_headers)

    assert response.status_code == 200
    assert response.get_json()["success"] is True
    assert response.get_json()["message"] == "Produto desativado com sucesso."

    assert client.get("/api/v1/products/1").get_json()["data"]["is_active"] is False
    active_products = client.get("/api/v1/products").get_json()["data"]
    all_products = client.get("/api/v1/products?active_only=false").get_json()["data"]
    assert all(product["id"] != 1 for product in active_products)
    assert any(product["id"] == 1 for product in all_products)


@pytest.mark.parametrize(
    "path",
    ["/api/v1/products/99999", "/api/v1/remover-produto/99999"],
)
def test_delete_product_returns_not_found(client, admin_headers, path):
    response = client.delete(path, headers=admin_headers)

    assert response.status_code == 404
    assert response.get_json()["error"] == "Produto não encontrado."


def test_delete_product_rejects_attendant(client, product_headers):
    response = client.delete(
        "/api/v1/remover-produto/1",
        headers=product_headers,
    )

    assert response.status_code == 403


def test_delete_product_database_error_is_generic_and_rolls_back(
    client, admin_headers, monkeypatch
):
    def fail_commit():
        raise SQLAlchemyError("sensitive database detail")

    monkeypatch.setattr(db.session, "commit", fail_commit)
    response = client.delete("/api/v1/remover-produto/1", headers=admin_headers)

    assert response.status_code == 500
    assert response.get_json() == {
        "success": False,
        "error": "Não foi possível desativar o produto.",
        "status_code": 500,
    }
    assert "sensitive database detail" not in response.get_data(as_text=True)
    assert db.session.get(Product, 1).is_active is True


def test_database_error_does_not_expose_internal_details(
    client, product_headers, monkeypatch
):
    def fail_commit():
        raise SQLAlchemyError("sensitive database detail")

    monkeypatch.setattr(db.session, "commit", fail_commit)
    response = client.post(
        "/api/v1/products",
        json={"name": "Produto", "price": 5, "category": "bebidas"},
        headers=product_headers,
    )

    assert response.status_code == 500
    assert response.get_json() == {
        "success": False,
        "error": "Não foi possível cadastrar o produto.",
        "status_code": 500,
    }
    assert "sensitive database detail" not in response.get_data(as_text=True)
