import pytest

from app import create_app
from app.extensions import db
from app.models.product import Product

ADMIN = {"X-Role": "admin"}
ATEND = {"X-Role": "atendente"}
BARISTA = {"X-Role": "barista"}


@pytest.fixture
def client():
    app = create_app()
    with app.app_context():
        db.session.add(Product(name="Item teste", price=10, category="bebidas"))
        db.session.commit()
    return app.test_client()


def test_put_valido_persiste_e_aparece_na_consulta(client):
    r = client.put("/api/v1/products/1", json={"price": 12.5, "name": " Novo nome "}, headers=ATEND)
    assert r.status_code == 200
    assert r.json["data"]["price"] == 12.5 and r.json["data"]["name"] == "Novo nome"
    g = client.get("/api/v1/products/1").json["data"]
    assert g["price"] == 12.5 and g["name"] == "Novo nome"


def test_put_parcial_nao_mexe_nos_outros_campos(client):
    client.put("/api/v1/products/1", json={"price": 11}, headers=ADMIN)
    g = client.get("/api/v1/products/1").json["data"]
    assert g["name"] == "Item teste" and g["category"] == "bebidas"


@pytest.mark.parametrize("corpo", [
    {}, [], {"price": -1}, {"price": 0}, {"price": "abc"}, {"price": True},
    {"name": ""}, {"name": 123}, {"name": "x" * 121},
    {"category": "outra"}, {"category": 5},
    {"is_active": True}, {"id": 9}, {"description": 5},
])
def test_put_invalido_retorna_400_e_nao_altera(client, corpo):
    r = client.put("/api/v1/products/1", json=corpo, headers=ADMIN)
    assert r.status_code == 400
    assert r.json["success"] is False and r.json["status_code"] == 400
    g = client.get("/api/v1/products/1").json["data"]
    assert g["price"] == 10 and g["name"] == "Item teste" and g["is_active"] is True


def test_put_json_malformado(client):
    r = client.put("/api/v1/products/1", data="{x", content_type="application/json", headers=ADMIN)
    assert r.status_code == 400


def test_put_id_inexistente(client):
    assert client.put("/api/v1/products/999", json={"price": 1}, headers=ADMIN).status_code == 404


def test_put_permissoes(client):
    assert client.put("/api/v1/products/1", json={"price": 1}).status_code == 401
    assert client.put("/api/v1/products/1", json={"price": 1}, headers=BARISTA).status_code == 403


def test_delete_desativa_e_some_da_listagem(client):
    assert client.delete("/api/v1/products/1", headers=ADMIN).status_code == 200
    assert client.get("/api/v1/products").json["count"] == 0
    assert client.get("/api/v1/products?active_only=false").json["count"] == 1


def test_delete_inexistente_e_permissoes(client):
    assert client.delete("/api/v1/products/999", headers=ADMIN).status_code == 404
    assert client.delete("/api/v1/products/1", headers=ATEND).status_code == 403
    assert client.delete("/api/v1/products/1").status_code == 401
