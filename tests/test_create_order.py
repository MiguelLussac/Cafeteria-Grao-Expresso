import pytest
from sqlalchemy.exc import OperationalError

from app import create_app
from app.extensions import db
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.services.sse_service import sse_broker


@pytest.fixture
def client():
    app = create_app()
    with app.app_context():
        db.session.add_all([
            Product(name="Cafe", price=6.50),                    # id 1
            Product(name="Pao de queijo", price=0.10),           # id 2
            Product(name="Suco", price=8.00, is_active=False),   # id 3 (inativo)
        ])
        db.session.commit()
    sse_broker.events.clear()
    c = app.test_client()
    c.app_ref = app
    return c


def contagem(client):
    with client.app_ref.app_context():
        return Order.query.count(), OrderItem.query.count()


def criar(client, **corpo):
    return client.post("/api/v1/orders", json=corpo)


def test_pedido_valido_um_item(client):
    r = criar(client, items=[{"product_id": 1, "quantity": 2}])
    assert r.status_code == 201
    assert r.json["data"]["total_amount"] == 13.0
    assert contagem(client) == (1, 1)


def test_pedido_valido_varios_itens_total_exato(client):
    r = criar(client, items=[{"product_id": 1, "quantity": 1}, {"product_id": 2, "quantity": 3}])
    assert r.status_code == 201
    assert r.json["data"]["total_amount"] == 6.8  # 6.50 + 3 * 0.10, sem erro de ponto flutuante
    assert contagem(client) == (1, 2)


def test_quantidade_ausente_assume_um(client):
    r = criar(client, items=[{"product_id": 1}])
    assert r.status_code == 201 and r.json["data"]["total_amount"] == 6.5


def test_itens_gravados_com_preco_unitario_e_pedido_correto(client):
    criar(client, items=[{"product_id": 1, "quantity": 2}])
    with client.app_ref.app_context():
        item = OrderItem.query.one()
        assert item.order_id == Order.query.one().id
        assert (item.product_id, item.quantity, float(item.unit_price)) == (1, 2, 6.5)


def test_preco_do_item_nao_muda_se_produto_mudar_depois(client):
    criar(client, items=[{"product_id": 1, "quantity": 1}])
    with client.app_ref.app_context():
        Product.query.get(1).price = 99
        db.session.commit()
        assert float(OrderItem.query.one().unit_price) == 6.5


def test_valores_enviados_pelo_frontend_sao_ignorados(client):
    r = criar(client, total_amount=0.01, items=[{"product_id": 1, "quantity": 1, "unit_price": 0.01, "price": 0.01}])
    assert r.status_code == 201 and r.json["data"]["total_amount"] == 6.5
    with client.app_ref.app_context():
        assert float(OrderItem.query.one().unit_price) == 6.5


def test_notes_preservado_e_padroes(client):
    criar(client, notes="  sem acucar ", items=[{"product_id": 1, "quantity": 1}])
    criar(client, customer_name="Ana", table_number="7", items=[{"product_id": 1, "quantity": 1}])
    with client.app_ref.app_context():
        o1, o2 = Order.query.order_by(Order.id).all()
        assert o1.notes == "sem acucar" and o1.customer_name == "Balcão" and o1.table_number == "Retirada"
        assert o2.customer_name == "Ana" and o2.table_number == "7"


def test_evento_sse_publicado_so_no_sucesso(client):
    criar(client, items=[{"product_id": 1, "quantity": 1}])
    assert [e[0] for e in sse_broker.events] == ["new_order"]
    sse_broker.events.clear()
    criar(client, items=[{"product_id": 999, "quantity": 1}])
    assert sse_broker.events == []


@pytest.mark.parametrize("corpo", [
    {}, {"items": []}, {"items": "x"}, {"items": {"product_id": 1}}, {"items": None},
    {"items": [1]}, {"items": ["a"]}, {"items": [None]}, {"items": [[1, 2]]},
    {"items": [{}]}, {"items": [{"quantity": 2}]},
    {"items": [{"product_id": "1", "quantity": 1}]}, {"items": [{"product_id": None, "quantity": 1}]},
    {"items": [{"product_id": 1.5, "quantity": 1}]}, {"items": [{"product_id": True, "quantity": 1}]},
    {"items": [{"product_id": 0, "quantity": 1}]}, {"items": [{"product_id": -1, "quantity": 1}]},
    {"items": [{"product_id": 1, "quantity": 0}]}, {"items": [{"product_id": 1, "quantity": -2}]},
    {"items": [{"product_id": 1, "quantity": "2"}]}, {"items": [{"product_id": 1, "quantity": 1.5}]},
    {"items": [{"product_id": 1, "quantity": True}]}, {"items": [{"product_id": 1, "quantity": None}]},
    {"items": [{"product_id": 1, "quantity": [1]}]},
    {"items": [{"product_id": 999, "quantity": 1}]},            # inexistente
    {"items": [{"product_id": 3, "quantity": 1}]},              # inativo
    {"items": [{"product_id": 1, "quantity": 1}], "customer_name": 5},
    {"items": [{"product_id": 1, "quantity": 1}], "table_number": ["1"]},
    {"items": [{"product_id": 1, "quantity": 1}], "notes": {"a": 1}},
])
def test_invalidos_retornam_400_e_nao_gravam(client, corpo):
    r = criar(client, **corpo)
    assert r.status_code == 400
    assert r.json["success"] is False and r.json["status_code"] == 400
    assert contagem(client) == (0, 0)


def test_corpo_malformado_ou_nao_objeto(client):
    assert client.post("/api/v1/orders", data="{x", content_type="application/json").status_code == 400
    assert client.post("/api/v1/orders", json=[1]).status_code == 400
    assert contagem(client) == (0, 0)


def test_item_invalido_depois_de_valido_nao_deixa_pedido_parcial(client):
    r = criar(client, items=[{"product_id": 1, "quantity": 1}, {"product_id": 3, "quantity": 1}])
    assert r.status_code == 400
    assert contagem(client) == (0, 0)


def test_falha_no_banco_retorna_500_e_nao_grava(client, monkeypatch):
    def quebra(*a, **k):
        raise OperationalError("x", {}, Exception("banco fora"))
    monkeypatch.setattr(db.session, "commit", quebra)
    r = criar(client, items=[{"product_id": 1, "quantity": 1}])
    assert r.status_code == 500 and r.json["success"] is False
    monkeypatch.undo()
    assert contagem(client) == (0, 0)
    assert sse_broker.events == []


def test_falha_no_sse_nao_derruba_pedido_ja_salvo(client, monkeypatch):
    def quebra(*a, **k):
        raise RuntimeError("sse fora")
    monkeypatch.setattr(sse_broker, "publish", quebra)
    r = criar(client, items=[{"product_id": 1, "quantity": 1}])
    assert r.status_code == 201
    assert contagem(client) == (1, 1)
