"""Verifica o serviço JS contra o Flask real, sem mocks HTTP ou banco persistente."""
import os
from pathlib import Path
import shutil
import subprocess
from threading import Thread

from werkzeug.serving import make_server


def test_frontend_order_service_against_flask(app):
    node = shutil.which("node")
    assert node, "Instale Node.js 20+ para testar a integração frontend/Flask."
    server = make_server("127.0.0.1", 0, app)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        result = subprocess.run(
            [node, "--test", "tests/orders.integration.mjs"],
            cwd=Path(__file__).resolve().parents[1] / "frontend",
            env={**os.environ, "API_TEST_URL": f"http://127.0.0.1:{server.server_port}"},
            capture_output=True, text=True, encoding="utf-8", timeout=60,
        )
        assert result.returncode == 0, result.stdout + result.stderr
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()
