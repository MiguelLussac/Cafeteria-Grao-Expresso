from flask import Blueprint, Response, stream_with_context
from queue import Empty
from app.services.sse_service import sse_broker

events_bp = Blueprint("events", __name__)

@events_bp.route("/events/orders", methods=["GET"])
def stream_order_events():
    """Stream de Server-Sent Events (SSE) para atualização de pedidos em tempo real."""

    def event_generator():
        q = sse_broker.subscribe()
        try:
            # Envia mensagem inicial de confirmação de conexão
            # Inscreve antes de solicitar o snapshot para não perder mudanças
            # ocorridas durante a recuperação. O consumidor aplica por order_id.
            yield ('retry: 3000\nevent: connected\n'
                   'data: {"message": "Conexão SSE estabelecida com sucesso", '
                   '"resync_required": true, "state_url": "/api/v1/orders/kitchen"}\n\n')
            while True:
                try:
                    msg = q.get(timeout=15)
                except Empty:
                    yield ": heartbeat\n\n"
                    continue
                if msg is None:
                    # Fila saturada: encerra para reconectar e recuperar via API.
                    return
                yield msg
        finally:
            sse_broker.unsubscribe(q)

    return Response(
        stream_with_context(event_generator()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
    )
