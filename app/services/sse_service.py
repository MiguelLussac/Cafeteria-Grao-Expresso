import json
import queue
import threading
from typing import Dict, Any

class SSEBroker:
    """Gerenciador pub/sub para envio de eventos em tempo real via Server-Sent Events (SSE)."""

    def __init__(self):
        self._listeners = []
        self.events = []
        self._lock = threading.Lock()

    def subscribe(self) -> queue.Queue:
        """Adiciona um novo cliente ouvinte e retorna sua fila."""
        q = queue.Queue(maxsize=100)
        with self._lock:
            self._listeners.append(q)
        return q

    def unsubscribe(self, q: queue.Queue):
        """Remove o ouvinte desconectado."""
        with self._lock:
            if q in self._listeners:
                self._listeners.remove(q)

    def publish(self, event: str, data: Dict[str, Any]):
        """Dispara um evento para todos os clientes conectados."""
        message = f"event: {event}\ndata: {json.dumps(data)}\n\n"
        with self._lock:
            self.events.append((event, data.copy()))
            to_remove = []
            for q in self._listeners:
                try:
                    q.put_nowait(message)
                except queue.Full:
                    # Acorda o gerador e força recuperação via API na reconexão.
                    while True:
                        try:
                            q.get_nowait()
                        except queue.Empty:
                            break
                    q.put_nowait(None)
                    to_remove.append(q)
            for q in to_remove:
                if q in self._listeners:
                    self._listeners.remove(q)

sse_broker = SSEBroker()
