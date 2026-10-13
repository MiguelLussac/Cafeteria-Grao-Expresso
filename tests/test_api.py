import json
import pytest
from datetime import datetime, timedelta, timezone
import jwt


@pytest.mark.parametrize("authorization", [None, "Basic invalid", "Bearer invalid"])
def test_protected_route_rejects_invalid_authentication(client, authorization):
    headers = {"Authorization": authorization} if authorization else {}
    response = client.post("/api/v1/products", json={}, headers=headers)
    assert response.status_code == 401
    assert response.get_json()["success"] is False


def test_protected_route_rejects_expired_token(client, app):
    token = jwt.encode(
        {"exp": datetime.now(timezone.utc) - timedelta(seconds=60)},
        app.config["JWT_SECRET_KEY"],
        algorithm="HS256",
    )
    response = client.post(
        "/api/v1/products", json={}, headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401
    assert response.get_json()["success"] is False


def test_barista_cannot_create_product(client):
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "barista", "password": "barista123"},
    )
    token = login.get_json()["data"]["token"]
    response = client.post(
        "/api/v1/products", json={}, headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403
    assert response.get_json()["success"] is False

def test_health_check(client):
    """Testa rota de verificação de saúde da API."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "healthy"
    assert "version" in data

def test_auth_login_success(client):
    """Testa login com sucesso do usuário padrão 'atendente'."""
    payload = {
        "username": "atendente",
        "password": "atendente123"
    }
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert "token" in data["data"]
    assert data["data"]["user"]["role"] == "atendente"

def test_auth_login_invalid(client):
    """Testa login com credenciais incorretas."""
    payload = {
        "username": "atendente",
        "password": "wrongpassword"
    }
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 401
    data = response.get_json()
    assert data["success"] is False

def test_list_products(client):
    """Testa listagem de produtos com categorias."""
    response = client.get("/api/v1/products")
    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert len(data["data"]) > 0

    # Teste de filtro por categoria
    response_bebidas = client.get("/api/v1/products?category=bebidas")
    assert response_bebidas.status_code == 200
    data_bebidas = response_bebidas.get_json()
    for item in data_bebidas["data"]:
        assert item["category"] == "bebidas"

def test_create_and_update_order_flow(client):
    """Testa fluxo completo: criar pedido, simular pagamento e atualizar status."""
    # 1. Cria pedido com o produto 1
    order_payload = {
        "customer_name": "Carlos Eduardo",
        "table_number": "Mesa 02",
        "notes": "Pouco açúcar",
        "items": [
            {"product_id": 1, "quantity": 2}
        ]
    }
    create_resp = client.post("/api/v1/orders", json=order_payload)
    assert create_resp.status_code == 201
    order_data = create_resp.get_json()["data"]
    order_id = order_data["id"]
    assert order_data["status"] == "recebido"
    assert order_data["total_amount"] > 0

    # 2. Registra pagamento simulado (PIX)
    payment_payload = {
        "method": "pix",
        "amount": order_data["total_amount"]
    }
    pay_resp = client.post(f"/api/v1/orders/{order_id}/payment", json=payment_payload)
    assert pay_resp.status_code == 201
    assert pay_resp.get_json()["data"]["status"] == "pago"

    # 3. Faz login como barista para avançar status
    login_resp = client.post("/api/v1/auth/login", json={"username": "barista", "password": "barista123"})
    token = login_resp.get_json()["data"]["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Atualiza status para 'em_preparo'
    status_resp = client.patch(f"/api/v1/orders/{order_id}/status", json={"status": "em_preparo"}, headers=headers)
    assert status_resp.status_code == 200
    assert status_resp.get_json()["data"]["status"] == "em_preparo"

    # Atualiza status para 'pronto'
    status_resp_pronto = client.patch(f"/api/v1/orders/{order_id}/status", json={"status": "pronto"}, headers=headers)
    assert status_resp_pronto.status_code == 200
    assert status_resp_pronto.get_json()["data"]["status"] == "pronto"
