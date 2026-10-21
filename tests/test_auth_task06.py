from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.extensions import db
from app.models.user import User


def login_token(client, username="atendente", password="atendente123"):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.get_json()["data"]["token"]


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_returns_bearer_token_and_user_without_password_hash(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "atendente", "password": "atendente123"},
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["success"] is True
    assert body["data"]["token"]
    assert body["data"]["token_type"] == "Bearer"
    assert body["data"]["expires_in"] == 12 * 60 * 60
    assert body["data"]["user"]["role"] == "atendente"
    assert "password_hash" not in body["data"]["user"]


def test_login_rejects_wrong_credentials(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "atendente", "password": "senha-errada"},
    )

    assert response.status_code == 401
    assert response.get_json() == {
        "success": False,
        "error": "Credenciais inválidas.",
        "status_code": 401,
    }


@pytest.mark.parametrize(
    "payload",
    [None, {}, {"username": "atendente"}, {"password": "atendente123"}, []],
)
def test_login_rejects_missing_or_invalid_payload(client, payload):
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 400
    assert response.get_json()["success"] is False
    assert response.get_json()["status_code"] == 400


def test_menu_query_is_public(client):
    response = client.get("/api/v1/products")
    assert response.status_code == 200
    assert response.get_json()["success"] is True
    assert response.get_json()["data"]


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/v1/products"),
        ("put", "/api/v1/products/1"),
        ("delete", "/api/v1/products/1"),
    ],
)
def test_card_menu_mutations_require_token(client, method, path):
    kwargs = {"json": {}} if method in {"post", "put"} else {}
    response = getattr(client, method)(path, **kwargs)
    assert response.status_code == 401
    assert response.get_json()["success"] is False
    assert response.get_json()["status_code"] == 401


@pytest.mark.parametrize("authorization", ["Bearer token-invalido", "Basic abc", "Bearer a b"])
def test_invalid_token_or_authorization_format_returns_401(client, authorization):
    response = client.post(
        "/api/v1/products",
        json={},
        headers={"Authorization": authorization},
    )
    assert response.status_code == 401
    assert response.get_json()["success"] is False


def test_expired_jwt_returns_401(client, app):
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": "1",
            "user_id": 1,
            "username": "admin",
            "role": "admin",
            "iat": now - timedelta(hours=2),
            "exp": now - timedelta(minutes=1),
        },
        app.config["JWT_SECRET_KEY"],
        algorithm="HS256",
    )

    response = client.post(
        "/api/v1/products",
        json={},
        headers=bearer(token),
    )
    assert response.status_code == 401
    assert response.get_json()["error"] == "Token expirado. Faça login novamente."


def test_atendente_can_create_and_update_but_cannot_delete(client):
    token = login_token(client)
    headers = bearer(token)

    create_response = client.post(
        "/api/v1/products",
        json={
            "name": "Produto de teste Task 06",
            "description": "Criado durante o teste de autenticação",
            "price": 5.50,
            "category": "bebidas",
        },
        headers=headers,
    )
    assert create_response.status_code == 201
    product_id = create_response.get_json()["data"]["id"]

    update_response = client.put(
        f"/api/v1/products/{product_id}",
        json={"name": "Produto de teste atualizado"},
        headers=headers,
    )
    assert update_response.status_code == 200
    assert update_response.get_json()["data"]["name"] == "Produto de teste atualizado"

    delete_response = client.delete(
        f"/api/v1/products/{product_id}",
        headers=headers,
    )
    assert delete_response.status_code == 403
    assert delete_response.get_json()["status_code"] == 403


def test_barista_cannot_create_update_or_delete_products(client):
    token = login_token(client, "barista", "barista123")
    headers = bearer(token)

    create_response = client.post("/api/v1/products", json={}, headers=headers)
    update_response = client.put("/api/v1/products/1", json={}, headers=headers)
    delete_response = client.delete("/api/v1/products/1", headers=headers)

    assert [create_response.status_code, update_response.status_code, delete_response.status_code] == [403, 403, 403]


def test_admin_can_delete_product(client):
    token = login_token(client, "admin", "admin123")
    response = client.delete("/api/v1/products/1", headers=bearer(token))
    assert response.status_code == 200
    assert response.get_json()["success"] is True


def test_inactive_employee_token_is_rejected(client, app):
    token = login_token(client)
    with app.app_context():
        user = User.query.filter_by(username="atendente").first()
        user.is_active = False
        db.session.commit()

    response = client.post(
        "/api/v1/products",
        json={},
        headers=bearer(token),
    )
    assert response.status_code == 401
    assert "desativado" in response.get_json()["error"]


def test_authenticated_profile_endpoint(client):
    token = login_token(client)
    response = client.get("/api/v1/auth/me", headers=bearer(token))
    assert response.status_code == 200
    assert response.get_json()["data"]["username"] == "atendente"
