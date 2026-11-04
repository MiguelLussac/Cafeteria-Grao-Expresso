from datetime import datetime, timedelta

import pytest

from app.extensions import db
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentStatus

URL = "/api/v1/orders/display"
BASE = datetime(2026, 1, 1, 12, 0, 0)


def criar_pedido(status=OrderStatus.RECEBIDO, pagamento=PaymentStatus.PAGO, minutos=0, **extra):
    """Cria um pedido (e, se 'pagamento' não for None, o pagamento). Retorna o id."""
    order = Order(
        customer_name=extra.get("customer_name", "Maria Segredo"),
        table_number=extra.get("table_number", "Mesa 9"),
        notes=extra.get("notes", "alergia a amendoim"),
        status=status,
        total_amount=extra.get("total", 42.90),
        created_at=BASE + timedelta(minutes=minutos),
    )
    db.session.add(order)
    db.session.flush()
    if pagamento is not None:
        db.session.add(Payment(order_id=order.id, method="pix", amount=order.total_amount, status=pagamento))
    db.session.commit()
    return order.id


def ids(client):
    return [p["id"] for p in client.get(URL).json["data"]]


def test_lista_vazia(client):
    r = client.get(URL)
    assert r.status_code == 200
    assert r.json == {"success": True, "count": 0, "data": []}


@pytest.mark.parametrize("status", OrderStatus.KITCHEN)
def test_pedidos_pagos_nos_tres_status_aparecem(client, status):
    pid = criar_pedido(status=status)
    assert client.get(URL).json["data"] == [{"id": pid, "status": status}]


@pytest.mark.parametrize("status", [OrderStatus.ENTREGUE, OrderStatus.CANCELADO])
def test_entregue_e_cancelado_nao_aparecem(client, status):
    criar_pedido(status=status)
    assert client.get(URL).json["count"] == 0


def test_pedido_sem_pagamento_nao_aparece(client):
    criar_pedido(pagamento=None)
    assert client.get(URL).json["count"] == 0


@pytest.mark.parametrize("pagamento", [PaymentStatus.PENDENTE, PaymentStatus.CANCELADO])
def test_pagamento_nao_confirmado_nao_aparece(client, pagamento):
    criar_pedido(pagamento=pagamento)
    assert client.get(URL).json["count"] == 0


def test_mistura_mostra_so_os_elegiveis(client):
    ok1 = criar_pedido(status=OrderStatus.EM_PREPARO, minutos=1)
    criar_pedido(pagamento=None, minutos=2)
    criar_pedido(status=OrderStatus.ENTREGUE, minutos=3)
    ok2 = criar_pedido(status=OrderStatus.PRONTO, minutos=4)
    criar_pedido(pagamento=PaymentStatus.PENDENTE, minutos=5)
    criar_pedido(status=OrderStatus.CANCELADO, minutos=6)
    assert ids(client) == [ok1, ok2]
    assert client.get(URL).json["count"] == 2


def test_ordem_de_chegada_independe_do_id(client):
    # o id mais baixo chegou por último: manda o created_at, não o id
    tarde = criar_pedido(minutos=30)
    cedo = criar_pedido(minutos=5)
    meio = criar_pedido(minutos=10)
    assert ids(client) == [cedo, meio, tarde]


def test_empate_de_horario_desempata_pelo_id(client):
    a = criar_pedido(minutos=0)
    b = criar_pedido(minutos=0)
    assert ids(client) == [a, b]


def test_privacidade_somente_id_e_status(client):
    criar_pedido(customer_name="Maria Segredo", table_number="Mesa 9", notes="alergia a amendoim", total=42.90)
    r = client.get(URL)
    assert set(r.json.keys()) == {"success", "count", "data"}
    assert all(set(item.keys()) == {"id", "status"} for item in r.json["data"])
    corpo = r.get_data(as_text=True).lower()
    for proibido in ["maria", "segredo", "mesa", "amendoim", "42.9", "pix", "amount", "total",
                     "customer", "notes", "payment", "created_at"]:
        assert proibido not in corpo


def test_rota_publica_nao_exige_login(client):
    assert client.get(URL).status_code == 200  # sem header Authorization


def test_apenas_get(client):
    assert client.post(URL, json={}).status_code == 405
    assert client.delete(URL).status_code == 405


def test_nao_quebra_a_consulta_de_pedido_por_id(client):
    pid = criar_pedido()
    assert client.get(f"/api/v1/orders/{pid}").status_code == 200
    assert client.get("/api/v1/orders/9999").status_code == 404