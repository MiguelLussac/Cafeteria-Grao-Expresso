"""Cards 4/5: liberação, fila, transições e recuperação de estado SSE."""
from datetime import datetime, timedelta
import json
from queue import Empty

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentStatus
from app.services.sse_service import sse_broker


@pytest.fixture
def headers(client):
    login = client.post('/api/v1/auth/login', json={
        'username': 'barista', 'password': 'barista123',
    })
    return {'Authorization': f"Bearer {login.get_json()['data']['token']}"}


@pytest.fixture
def listener():
    q = sse_broker.subscribe()
    try:
        yield q
    finally:
        sse_broker.unsubscribe(q)


def create(client, **fields):
    response = client.post('/api/v1/orders', json={
        'items': [{'product_id': 1, 'quantity': 2}], 'notes': 'Sem açúcar', **fields,
    })
    assert response.status_code == 201
    return response.get_json()['data']['id']


def pay(client, order_id):
    response = client.post(f'/api/v1/orders/{order_id}/payment', json={'method': 'pix'})
    assert response.status_code == 201
    return response.get_json()['data']


def advance(client, headers, order_id, status):
    return client.patch(f'/api/v1/orders/{order_id}/status',
                        json={'status': status}, headers=headers)


def event(q):
    message = q.get_nowait()
    name, data = message.strip().split('\n')
    return name.removeprefix('event: '), json.loads(data.removeprefix('data: '))


def test_kitchen_only_paid_active_orders_complete_and_chronological(client, headers):
    unpaid = create(client)
    first_created = create(client)
    second_created = create(client)
    pay(client, second_created)
    pay(client, first_created)
    rows = client.get('/api/v1/orders/kitchen', headers=headers).get_json()['data']
    assert [row['id'] for row in rows] == [second_created, first_created]
    assert rows[0]['notes'] == 'Sem açúcar'
    assert rows[0]['items'][0]['quantity'] == 2
    assert rows[0]['items'][0]['product_name']
    assert rows[0]['payment']['status'] == 'pago'
    assert client.get('/api/v1/orders').get_json()['count'] == 3
    assert client.get(f'/api/v1/orders/{unpaid}').status_code == 200
    assert advance(client, headers, second_created, 'em_preparo').status_code == 200
    filtered = client.get('/api/v1/orders/kitchen?status=em_preparo', headers=headers)
    assert [row['id'] for row in filtered.get_json()['data']] == [second_created]
    assert advance(client, headers, second_created, 'pronto').status_code == 200
    assert advance(client, headers, second_created, 'entregue').status_code == 200
    assert advance(client, headers, first_created, 'cancelado').status_code == 200
    assert client.get('/api/v1/orders/kitchen', headers=headers).get_json()['data'] == []


def test_kitchen_payment_status_and_tie_breaker(client, headers):
    ids = [create(client) for _ in range(4)]
    for order_id in ids:
        pay(client, order_id)
    paid_at = datetime(2026, 1, 1)
    Payment.query.update({Payment.paid_at: paid_at})
    Payment.query.filter_by(order_id=ids[2]).update({'status': PaymentStatus.PENDENTE})
    Payment.query.filter_by(order_id=ids[3]).update({'status': PaymentStatus.CANCELADO})
    # Criação não determina a posição: a fila começa na liberação/pagamento.
    db.session.get(Order, ids[0]).created_at = paid_at + timedelta(days=1)
    db.session.commit()
    rows = client.get('/api/v1/orders/kitchen', headers=headers).get_json()['data']
    assert [row['id'] for row in rows] == ids[:2]
    for order_id in ids[2:]:
        assert advance(client, headers, order_id, 'em_preparo').status_code == 409


def test_kitchen_snapshot_does_not_truncate_at_fifty(client, headers):
    for _ in range(55):
        order = Order(status='recebido', total_amount=1)
        order.payment = Payment(method='pix', amount=1, status='pago')
        db.session.add(order)
    db.session.commit()
    response = client.get('/api/v1/orders/kitchen', headers=headers)
    assert response.get_json()['count'] == 55
    assert len(response.get_json()['data']) == 55


@pytest.mark.parametrize('path', ['/api/v1/orders/kitchen', '/api/v1/orders/1/status'])
@pytest.mark.parametrize('authorization', [None, 'Bearer invalid'])
def test_kitchen_requires_jwt(client, path, authorization):
    headers = {'Authorization': authorization} if authorization else {}
    response = (client.get(path, headers=headers) if path.endswith('kitchen') else
                client.patch(path, json={'status': 'em_preparo'}, headers=headers))
    assert response.status_code == 401


@pytest.mark.parametrize('role', ['admin', 'atendente', 'barista'])
def test_employee_roles_allowed(client, role):
    login = client.post('/api/v1/auth/login', json={'username': role, 'password': role + '123'})
    headers = {'Authorization': 'Bearer ' + login.get_json()['data']['token']}
    assert client.get('/api/v1/orders/kitchen', headers=headers).status_code == 200


def test_invalid_kitchen_filter(client, headers):
    for status in ['cancelado', 'entregue', 'invalid', '']:
        assert client.get('/api/v1/orders/kitchen?status=' + status,
                          headers=headers).status_code == 400


@pytest.mark.parametrize('current', OrderStatus.ALL)
@pytest.mark.parametrize('target', OrderStatus.ALL)
def test_transition_matrix(client, headers, listener, current, target):
    order_id = create(client)
    pay(client, order_id)
    event(listener)
    order = db.session.get(Order, order_id)
    order.status = current
    db.session.commit()
    allowed = target in {
        'recebido': {'em_preparo', 'cancelado'},
        'em_preparo': {'pronto', 'cancelado'},
        'pronto': {'entregue'},
        'entregue': set(), 'cancelado': set(),
    }[current]
    response = advance(client, headers, order_id, target)
    assert response.status_code == (200 if allowed else 409)
    assert client.get(f'/api/v1/orders/{order_id}').get_json()['data']['status'] == (
        target if allowed else current)
    if allowed:
        name, data = event(listener)
        assert name == 'order_status_updated'
        assert data['order_id'] == order_id and data['status'] == target
        assert data['updated_at']
        if target == 'pronto':
            assert event(listener) == ('order_ready', data)
    assert listener.empty()


@pytest.mark.parametrize('payload', [{}, {'status': None}, {'status': 3},
                                     {'status': []}, {'status': 'invalid'}, ['bad']])
def test_invalid_status_payload(client, headers, listener, payload):
    order_id = create(client)
    response = client.patch(f'/api/v1/orders/{order_id}/status', json=payload, headers=headers)
    assert response.status_code == 400
    assert listener.empty()


def test_unpaid_cannot_prepare_but_can_cancel(client, headers, listener):
    order_id = create(client)
    assert advance(client, headers, order_id, 'em_preparo').status_code == 409
    assert listener.empty()
    assert advance(client, headers, order_id, 'cancelado').status_code == 200
    assert client.post(f'/api/v1/orders/{order_id}/payment', json={'method': 'pix'}).status_code == 409


@pytest.mark.parametrize('amount', [0, -1, 1, 100, 'NaN', 'Infinity', '-Infinity', True, {}, []])
def test_invalid_payment_never_releases_order(client, headers, listener, amount):
    order_id = create(client)
    response = client.post(f'/api/v1/orders/{order_id}/payment',
                           json={'method': 'pix', 'amount': amount})
    assert response.status_code == 400
    assert listener.empty()
    assert client.get('/api/v1/orders/kitchen', headers=headers).get_json()['data'] == []
    assert client.get(f'/api/v1/orders/{order_id}/payment').status_code == 404


def test_release_only_after_payment_once_with_full_payload(client, listener):
    order_id = create(client)
    assert listener.empty()
    payment = pay(client, order_id)
    name, data = event(listener)
    assert name == 'new_order'
    assert data['order_id'] == data['id'] == order_id
    assert data['items'][0]['quantity'] == 2
    assert data['notes'] == 'Sem açúcar'
    assert data['payment'] == payment
    assert client.post(f'/api/v1/orders/{order_id}/payment', json={'method': 'pix'}).status_code == 400
    assert listener.empty()


@pytest.mark.parametrize('operation', ['payment', 'status'])
def test_failed_commit_emits_nothing(client, headers, listener, monkeypatch, operation):
    order_id = create(client)
    if operation == 'status':
        pay(client, order_id)
        event(listener)

    def fail():
        raise SQLAlchemyError('database unavailable')

    with monkeypatch.context() as patch:
        patch.setattr(db.session, 'commit', fail)
        response = (client.post(f'/api/v1/orders/{order_id}/payment', json={'method': 'pix'})
                    if operation == 'payment' else advance(client, headers, order_id, 'em_preparo'))
    assert response.status_code == 500
    assert listener.empty()
    order = client.get(f'/api/v1/orders/{order_id}').get_json()['data']
    assert order['status'] == 'recebido'
    if operation == 'payment':
        assert order['payment'] is None


def test_concurrent_status_conflict_emits_nothing(client, headers, listener, monkeypatch):
    order_id = create(client)
    pay(client, order_id)
    event(listener)
    monkeypatch.setattr(type(Order.query), 'update', lambda *args, **kwargs: 0)
    response = advance(client, headers, order_id, 'em_preparo')
    assert response.status_code == 409
    assert listener.empty()
    assert client.get(f'/api/v1/orders/{order_id}').get_json()['data']['status'] == 'recebido'


def test_stream_disconnect_reconnect_and_api_recovery(client, headers):
    before = len(sse_broker._listeners)
    stream = client.get('/api/v1/events/orders', buffered=False)
    assert stream.mimetype == 'text/event-stream'
    connected = next(stream.response).decode()
    assert 'retry: 3000' in connected and 'event: connected' in connected
    assert '"resync_required": true' in connected
    assert len(sse_broker._listeners) == before + 1
    stream.close()
    assert len(sse_broker._listeners) == before
    order_id = create(client)
    pay(client, order_id)
    assert advance(client, headers, order_id, 'em_preparo').status_code == 200
    # Last-Event-ID não promete replay: toda reconexão requer novo snapshot.
    stream = client.get('/api/v1/events/orders', headers={'Last-Event-ID': 'old'}, buffered=False)
    connected = next(stream.response).decode()
    metadata = json.loads(connected.split('data: ')[1])
    recovered = client.get(metadata['state_url'], headers=headers).get_json()['data']
    assert [row['id'] for row in recovered] == [order_id]
    assert recovered[0]['status'] == 'em_preparo'
    assert advance(client, headers, order_id, 'pronto').status_code == 200
    assert 'event: order_status_updated' in next(stream.response).decode()
    assert 'event: order_ready' in next(stream.response).decode()
    stream.close()
    assert len(sse_broker._listeners) == before


def test_stream_delivers_release_to_multiple_clients(client):
    first = client.get('/api/v1/events/orders', buffered=False)
    second = client.get('/api/v1/events/orders', buffered=False)
    try:
        next(first.response)
        next(second.response)
        order_id = create(client)
        pay(client, order_id)
        messages = [next(first.response), next(second.response)]
        assert messages[0] == messages[1]
        assert 'event: new_order' in messages[0].decode()
    finally:
        second.close()
        first.close()


def test_slow_stream_is_closed_to_force_resync(client):
    before = len(sse_broker._listeners)
    stream = client.get('/api/v1/events/orders', buffered=False)
    next(stream.response)
    for i in range(101):
        sse_broker.publish('order_status_updated', {'order_id': i})
    with pytest.raises(StopIteration):
        next(stream.response)
    stream.close()
    assert len(sse_broker._listeners) == before


def test_idle_stream_heartbeat_and_cleanup(client, monkeypatch):
    from queue import Queue
    q = Queue()
    calls = []

    def get(timeout):
        calls.append(timeout)
        if len(calls) == 1:
            raise Empty
        return None

    monkeypatch.setattr(q, 'get', get)
    monkeypatch.setattr(sse_broker, 'subscribe', lambda: q)
    monkeypatch.setattr(sse_broker, 'unsubscribe', lambda value: calls.append(value))
    stream = client.get('/api/v1/events/orders', buffered=False)
    next(stream.response)
    assert next(stream.response) == b': heartbeat\n\n'
    with pytest.raises(StopIteration):
        next(stream.response)
    stream.close()
    assert calls == [15, 15, q]
