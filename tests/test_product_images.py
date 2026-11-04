import io

import pytest

from app import create_app
from app.extensions import db
from app.models.product import Product
from app.services import storage_service

ADMIN = {"X-Role": "admin"}
BASE_URL = "https://projeto.supabase.co"
PUBLIC_PREFIX = f"{BASE_URL}/storage/v1/object/public/produtos/"

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 64


class FakeStorage:
    """Substitui as chamadas HTTP ao Supabase Storage."""

    def __init__(self):
        self.objects = {}
        self.deleted = []
        self.fail_upload = False

    def upload(self, path, content, content_type):
        if self.fail_upload:
            raise storage_service.StorageError("fora do ar")
        self.objects[path] = (content, content_type)
        return storage_service.public_url(path)

    def delete(self, path):
        self.deleted.append(path)
        self.objects.pop(path, None)


@pytest.fixture
def app():
    application = create_app()
    application.config.update(SUPABASE_URL=BASE_URL, SUPABASE_SERVICE_ROLE_KEY="chave-de-teste")
    with application.app_context():
        db.session.add(Product(name="Latte", price=10, category="bebidas"))
        db.session.commit()
    return application


@pytest.fixture
def storage(monkeypatch):
    fake = FakeStorage()
    monkeypatch.setattr(storage_service, "upload", fake.upload)
    monkeypatch.setattr(storage_service, "delete", fake.delete)
    return fake


def send(client, content, filename="foto.png", product_id=1, headers=ADMIN):
    return client.post(
        f"/api/v1/products/{product_id}/image",
        data={"image": (io.BytesIO(content), filename)},
        content_type="multipart/form-data",
        headers=headers,
    )


@pytest.mark.parametrize("content,extension,content_type", [
    (PNG, "png", "image/png"), (JPEG, "jpg", "image/jpeg"), (WEBP, "webp", "image/webp"),
])
def test_upload_salva_no_bucket_e_grava_a_url_publica(app, storage, content, extension, content_type):
    r = send(app.test_client(), content, filename="qualquer-nome.bin")
    assert r.status_code == 200, r.json
    url = r.json["data"]["image_url"]
    assert url.startswith(PUBLIC_PREFIX + "products/1/") and url.endswith(f".{extension}")
    [(path, (saved, saved_type))] = storage.objects.items()
    assert saved == content and saved_type == content_type
    assert app.test_client().get("/api/v1/products/1").json["data"]["image_url"] == url


def test_nova_foto_apaga_a_anterior_do_bucket(app, storage):
    client = app.test_client()
    first = send(client, PNG).json["data"]["image_url"]
    second = send(client, WEBP).json["data"]["image_url"]
    assert first != second
    assert storage.deleted == [first.removeprefix(PUBLIC_PREFIX)]
    assert list(storage.objects) == [second.removeprefix(PUBLIC_PREFIX)]


def test_remover_foto_limpa_o_produto_e_o_bucket(app, storage):
    client = app.test_client()
    url = send(client, PNG).json["data"]["image_url"]
    r = client.delete("/api/v1/products/1/image", headers=ADMIN)
    assert r.status_code == 200 and r.json["data"]["image_url"] is None
    assert storage.deleted == [url.removeprefix(PUBLIC_PREFIX)] and storage.objects == {}


def test_trocar_por_link_externo_apaga_a_foto_do_bucket_mas_link_externo_nao(app, storage):
    client = app.test_client()
    url = send(client, PNG).json["data"]["image_url"]
    client.put("/api/v1/products/1", json={"image_url": "https://exemplo.com/latte.jpg"}, headers=ADMIN)
    assert storage.deleted == [url.removeprefix(PUBLIC_PREFIX)]
    # Link externo não é nosso: remover não tenta apagar nada no bucket.
    client.put("/api/v1/products/1", json={"image_url": None}, headers=ADMIN)
    assert storage.deleted == [url.removeprefix(PUBLIC_PREFIX)]


@pytest.mark.parametrize("content", [b"", b"GIF89a" + b"\x00" * 32, b"<svg></svg>", b"texto qualquer"])
def test_formato_invalido_retorna_400_sem_enviar(app, storage, content):
    r = send(app.test_client(), content, filename="foto.png")
    assert r.status_code == 400 and storage.objects == {}


def test_foto_maior_que_2mb_retorna_413(app, storage):
    r = send(app.test_client(), PNG + b"\x00" * (2 * 1024 * 1024))
    assert r.status_code == 413 and storage.objects == {}


def test_sem_campo_image_retorna_400(app, storage):
    r = app.test_client().post("/api/v1/products/1/image", data={}, headers=ADMIN)
    assert r.status_code == 400


def test_falha_no_storage_retorna_502_sem_mudar_o_produto(app, storage):
    storage.fail_upload = True
    r = send(app.test_client(), PNG)
    assert r.status_code == 502
    assert app.test_client().get("/api/v1/products/1").json["data"]["image_url"] is None


def test_sem_storage_configurado_retorna_503(app, storage):
    app.config.update(SUPABASE_URL=None)
    r = send(app.test_client(), PNG)
    assert r.status_code == 503 and storage.objects == {}


def test_permissoes_e_produto_inexistente(app, storage):
    client = app.test_client()
    assert send(client, PNG, headers={"X-Role": "barista"}).status_code == 403
    assert send(client, PNG, headers={}).status_code == 401
    assert send(client, PNG, product_id=99).status_code == 404
    assert client.delete("/api/v1/products/99/image", headers=ADMIN).status_code == 404
