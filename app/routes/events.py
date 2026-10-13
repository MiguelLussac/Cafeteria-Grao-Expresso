from flask import Blueprint, Response, stream_with_context
from app.services.sse_service import sse_broker

events_bp = Blueprint("events", __name__)

@events_bp.route("/events/orders", methods=["GET"])
def stream_order_events():
    """Stream de Server-Sent Events (SSE) para atualização de pedidos em tempo real."""

    def event_generator():
        q = sse_broker.subscribe()
        try:
            # Envia mensagem inicial de confirmação de conexão
            yield "event: connected\ndata: {\"message\": \"Conexão SSE estabelecida com sucesso\"}\n\n"
            while True:
                msg = q.get()
                yield msg
        except GeneratorExit:
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
