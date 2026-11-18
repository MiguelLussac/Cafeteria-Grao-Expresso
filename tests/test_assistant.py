"""Assistente de pedidos do totem. A IA é sempre simulada: nada chama o Gemini real."""
import pytest

from app.extensions import db
from app.models.product import Product
from app.services import assistant_service

URL = "/api/v1/assistant/chat"


def conversa(*textos):
    return [{"role": "user", "content": t} for t in textos]


@pytest.fixture
def ia(app, monkeypatch):
    """Substitui o Gemini: devolve `ia.resposta` e guarda o que foi enviado."""
    app.config["GEMINI_API_KEY"] = "chave-de-teste"

    class FakeIA:
        resposta = {"reply": "Certo!", "cart": [], "ready_to_checkout": False}
        chamadas = []

        def __call__(self, system_prompt, contents):
            self.chamadas.append({"system": system_prompt, "contents": contents})
            if isinstance(self.resposta, Exception):
                raise self.resposta
            return self.resposta

    fake = FakeIA()
    fake.chamadas = []
    monkeypatch.setattr(assistant_service, "call_gemini", fake)
    return fake


def test_sem_chave_configurada_responde_503(client):
    r = client.post(URL, json={"messages": conversa("Quero um café")})
    assert r.status_code == 503
    assert "indisponível" in r.json["error"]


@pytest.mark.parametrize("body", [
    None,
    {},
    {"messages": []},
    {"messages": "oi"},
    {"messages": [{"role": "system", "content": "oi"}]},
    {"messages": [{"role": "user", "content": "   "}]},
    {"messages": [{"role": "user", "content": "x" * 501}]},
    {"messages": [{"role": "user", "content": "oi"}, {"role": "assistant", "content": "Olá"}]},
    {"messages": conversa("oi"), "cart": "nada"},
    {"messages": conversa(*["oi"] * 31)},
])
def test_requisicao_invalida_retorna_400_sem_chamar_ia(client, ia, body):
    r = client.post(URL, json=body)
    assert r.status_code == 400
    assert ia.chamadas == []


def test_carrinho_usa_nome_e_preco_do_banco(client, ia):
    produto = db.session.get(Product, 1)
    ia.resposta = {
        "reply": "Adicionei 2 expressos.",
        "cart": [{"product_id": 1, "quantity": 2}],
        "ready_to_checkout": False,
    }
    r = client.post(URL, json={"messages": conversa("Dois expressos, por favor")})
    assert r.status_code == 200
    data = r.json["data"]
    assert data["reply"] == "Adicionei 2 expressos."
    assert data["cart"] == [{
        "product_id": 1,
        "name": produto.name,
        "price": float(produto.price),
        "category": produto.category,
        "nutrition": None,
        "quantity": 2,
    }]
    assert data["ready_to_checkout"] is False


def test_descarta_produtos_inventados_inativos_e_quantidades_invalidas(client, ia):
    inativo = db.session.get(Product, 2)
    inativo.is_active = False
    db.session.commit()
    ia.resposta = {
        "reply": "Pronto.",
        "cart": [
            {"product_id": 9999, "quantity": 1},   # não existe
            {"product_id": 2, "quantity": 1},      # inativo
            {"product_id": 3, "quantity": 0},      # quantidade inválida
            {"product_id": 4, "quantity": "2"},    # texto
            {"product_id": True, "quantity": 1},   # booleano
            {"product_id": 5, "quantity": 500},    # acima do limite
            {"product_id": 6, "quantity": 1},
            {"product_id": 6, "quantity": 2},      # repetido: soma
            "lixo",
        ],
        "ready_to_checkout": False,
    }
    r = client.post(URL, json={"messages": conversa("Quero tudo")})
    cart = {item["product_id"]: item["quantity"] for item in r.json["data"]["cart"]}
    assert cart == {5: assistant_service.MAX_QUANTITY, 6: 3}


def test_prompt_recebe_cardapio_ativo_e_carrinho_atual(client, ia):
    client.post(URL, json={
        "messages": conversa("Mais um, por favor"),
        "cart": [{"product_id": 1, "quantity": 1}, {"product_id": 9999, "quantity": 1}],
    })
    system = ia.chamadas[0]["system"]
    produto = db.session.get(Product, 1)
    assert produto.name in system
    assert '"product_id": 1, "quantity": 1' in system
    assert "9999" not in system


def test_saudacao_inicial_do_assistente_nao_vai_para_a_ia(client, ia):
    client.post(URL, json={"messages": [
        {"role": "assistant", "content": "Olá! O que vai querer hoje?"},
        {"role": "user", "content": "Um latte"},
        {"role": "assistant", "content": "Qual tamanho?"},
        {"role": "user", "content": "O normal"},
    ]})
    contents = ia.chamadas[0]["contents"]
    assert [c["role"] for c in contents] == ["user", "model", "user"]
    assert contents[0]["parts"][0]["text"] == "Um latte"


def test_ready_to_checkout_exige_carrinho_com_itens(client, ia):
    ia.resposta = {"reply": "Fechado!", "cart": [], "ready_to_checkout": True}
    r = client.post(URL, json={"messages": conversa("Só isso")})
    assert r.json["data"]["ready_to_checkout"] is False

    ia.resposta = {"reply": "Fechado!", "cart": [{"product_id": 1, "quantity": 1}], "ready_to_checkout": True}
    r = client.post(URL, json={"messages": conversa("Só isso")})
    assert r.json["data"]["ready_to_checkout"] is True


@pytest.mark.parametrize("resposta", [
    assistant_service.AssistantError("timeout"),
    {"reply": "", "cart": [], "ready_to_checkout": False},
    {"cart": []},
    ["não é objeto"],
])
def test_falha_da_ia_responde_502_generico(client, ia, resposta):
    ia.resposta = resposta
    r = client.post(URL, json={"messages": conversa("Oi")})
    assert r.status_code == 502
    assert "timeout" not in r.json["error"]


def test_call_gemini_sem_chave_levanta_indisponivel(app):
    app.config["GEMINI_API_KEY"] = None
    with pytest.raises(assistant_service.AssistantUnavailable):
        assistant_service.call_gemini("sistema", [])


def test_call_gemini_monta_requisicao_e_le_resposta(app, monkeypatch):
    import io
    import json

    app.config["GEMINI_API_KEY"] = "chave-de-teste"
    app.config["GEMINI_MODEL"] = "modelo-x"
    enviado = {}

    class Resposta(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout):
        enviado["url"] = request.full_url
        enviado["headers"] = dict(request.header_items())
        enviado["body"] = json.loads(request.data)
        payload = {"candidates": [{"content": {"parts": [
            {"text": "pensando...", "thought": True},
            {"text": json.dumps({"reply": "Oi!", "cart": [], "ready_to_checkout": False})},
        ]}}]}
        return Resposta(json.dumps(payload).encode())

    monkeypatch.setattr(assistant_service.urllib.request, "urlopen", fake_urlopen)
    result = assistant_service.call_gemini("sistema", [{"role": "user", "parts": [{"text": "oi"}]}])

    assert result == {"reply": "Oi!", "cart": [], "ready_to_checkout": False}
    assert enviado["url"].endswith("/models/modelo-x:generateContent")
    assert enviado["headers"]["X-goog-api-key"] == "chave-de-teste"
    assert "chave-de-teste" not in enviado["url"]
    assert enviado["body"]["systemInstruction"]["parts"][0]["text"] == "sistema"
    assert enviado["body"]["generationConfig"]["responseMimeType"] == "application/json"
