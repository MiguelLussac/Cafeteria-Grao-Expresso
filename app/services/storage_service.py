"""Fotos dos produtos no Supabase Storage (API REST, sem dependências extras)."""
import http.client
import json
from urllib.parse import quote, urlsplit

from flask import current_app

TIMEOUT_SECONDS = 20


class StorageError(Exception):
    """Falha ao falar com o Supabase Storage."""


def is_configured():
    return bool(current_app.config.get("SUPABASE_URL") and current_app.config.get("SUPABASE_SERVICE_ROLE_KEY"))


def _bucket_url(public=False):
    config = current_app.config
    scope = "object/public" if public else "object"
    return f"{config['SUPABASE_URL']}/storage/v1/{scope}/{config['SUPABASE_STORAGE_BUCKET']}"


def _object_url(path, public=False):
    return f"{_bucket_url(public)}/{quote(path)}"


def public_url(path):
    return _object_url(path, public=True)


def path_from_url(url):
    """Caminho do objeto se a URL for deste bucket; None para links externos."""
    if not url or not is_configured():
        return None
    prefix = _object_url("", public=True)
    if not url.startswith(prefix):
        return None
    return url[len(prefix):] or None


def _request(method, url, data=None, headers=None):
    # http.client direto: com urllib o DELETE do Storage demorava 5 s ou
    # estourava o timeout, enquanto a mesma requisição aqui leva ~0,5 s.
    key = current_app.config["SUPABASE_SERVICE_ROLE_KEY"]
    parts = urlsplit(url)
    connection_class = http.client.HTTPSConnection if parts.scheme == "https" else http.client.HTTPConnection
    connection = connection_class(parts.netloc, timeout=TIMEOUT_SECONDS)
    try:
        connection.request(method, parts.path, body=data,
                           headers={"Authorization": f"Bearer {key}", "apikey": key, **(headers or {})})
        response = connection.getresponse()
        body = response.read()
    except (OSError, http.client.HTTPException) as err:
        raise StorageError(f"Storage indisponível: {err}") from err
    finally:
        connection.close()
    if response.status >= 400:
        raise StorageError(f"Storage respondeu {response.status}: {body.decode('utf-8', 'replace')[:300]}")
    return response.status


def upload(path, content, content_type):
    """Envia o arquivo e devolve a URL pública."""
    # Cada upload tem nome único e nunca é sobrescrito: o navegador pode
    # guardar a foto por 1 ano (o padrão do Supabase obriga a revalidar).
    _request("POST", _object_url(path), data=content,
             headers={"Content-Type": content_type, "x-upsert": "false", "cache-control": "max-age=31536000"})
    return public_url(path)


def delete(path):
    # Endpoint de remoção em lote: devolve a lista do que foi apagado.
    body = json.dumps({"prefixes": [path]}).encode()
    _request("DELETE", _bucket_url(), data=body, headers={"Content-Type": "application/json"})


def delete_quietly(url):
    """Remove a foto antiga do bucket; falhas só vão para o log (não bloqueiam a edição)."""
    path = path_from_url(url)
    if not path:
        return
    try:
        delete(path)
    except StorageError:
        current_app.logger.warning("Não foi possível remover a foto antiga %s do Storage.", path)
