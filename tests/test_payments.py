import pytest
from sqlalchemy.exc import OperationalError

from app import create_app
from app.extensions import db
from app.models.order import Order, OrderItem
from app.models.payment import Payment
from app.models.product import Product


@pytest.fixture
def client():
    app = create_app()
    with app.app_context():
        db.session.add(Product(name="Cafe", price=6.50))
        db.session.add(Order(customer_name="Ana", table_number="1", total_amount=13.00))
        db.session.add(Order(customer_name="Bia", table_number="2", total_amount=10.10))
        db.session.commit()
    c = app.test_client()
    c.app_ref = app
    return c


def pagar(client, order_id=1, **corpo):
    return client.post(f"/api/v1/orders/{order_id}/payment", json=corpo)


@pytest.mark.parametrize("forma", ["dinheiro", "cartao", "pix", " PIX ", "Cartao"])
def test_formas_validas(client, forma):
    r = pagar(client, method=forma)
    assert r.status_code == 201
    assert r.json["data"]["status"] == "pago"
    assert r.json["data"]["method"] == forma.strip().lower()


def test_sem_amount_usa_total_do_pedido(client):
    r = pagar(client, method="pix")
    assert r.json["data"]["amount"] == 13.0


def test_amount_igual_ao_total_aceito(client):
    assert pagar(client, method="pix", amount=13.00).status_code == 201
    assert pagar(client, 2, method="pix", amount="10.10").status_code == 201


@pytest.mark.parametrize("valor", [12.99, 13.01, 0, -13, 1300, "abc", True, "nan", "inf", [], {}])
def test_amount_diferente_do_total_ou_invalido(client, valor):
    r = pagar(client, method="pix", amount=valor)
    assert r.status_code == 400 and r.json["success"] is False
    assert client.get("/api/v1/orders/1/payment").status_code == 404  # nada foi gravado


@pytest.mark.parametrize("corpo", [{}, {"method": ""}, {"method": "   "}, {"method": 5},
                                   {"method": "boleto"}, {"method": None}])
def test_metodo_invalido(client, corpo):
    assert pagar(client, **corpo).status_code == 400


def test_json_malformado_ou_nao_objeto(client):
    r = client.post("/api/v1/orders/1/payment", data="{x", content_type="application/json")
    assert r.status_code == 400
    r = client.post("/api/v1/orders/1/payment", json=["pix"])
    assert r.status_code == 400


def test_pedido_inexistente(client):
    assert pagar(client, 999, method="pix").status_code == 404
    assert client.get("/api/v1/orders/999/payment").status_code == 404


def test_pagamento_duplicado(client):
    assert pagar(client, method="pix").status_code == 201
    r = pagar(client, method="dinheiro")
    assert r.status_code == 400 and "já possui" in r.json["error"]
    with client.app_ref.app_context():
        assert Payment.query.filter_by(order_id=1).count() == 1


def test_pagamento_associado_ao_pedido_correto(client):
    pagar(client, 2, method="cartao")
    assert client.get("/api/v1/orders/2/payment").json["data"]["order_id"] == 2
    assert client.get("/api/v1/orders/1/payment").status_code == 404


def test_pagamento_persistido_e_consultavel(client):
    pagar(client, method="pix")
    d = client.get("/api/v1/orders/1/payment").json["data"]
    assert d["method"] == "pix" and d["amount"] == 13.0 and d["status"] == "pago"


def test_falha_no_commit_nao_confirma_pagamento(client, monkeypatch):
    def quebra(*a, **k):
        raise OperationalError("x", {}, Exception("banco fora"))
    monkeypatch.setattr(db.session, "commit", quebra)
    r = pagar(client, method="pix")
    assert r.status_code == 500 and r.json["success"] is False
    monkeypatch.undo()
    assert client.get("/api/v1/orders/1/payment").status_code == 404
