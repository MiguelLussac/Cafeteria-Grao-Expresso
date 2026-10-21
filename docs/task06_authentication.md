# Tarefa 06 — Autenticação básica com JWT

## Contrato adotado

A implementação segue o contrato já presente em `docs/api_contracts.md`:

- `POST /api/v1/auth/login`: recebe `username` e `password` em JSON e retorna `data.token`.
- `GET /api/v1/auth/me`: exige JWT e devolve o funcionário autenticado.
- `GET /api/v1/products` e `GET /api/v1/products/<id>` continuam públicos.
- `POST /api/v1/products` e `PUT /api/v1/products/<id>` exigem perfil `admin` ou `atendente`.
- `DELETE /api/v1/products/<id>` exige perfil `admin`.
- O JWT é enviado no cabeçalho HTTP `Authorization: Bearer <token>`.

O token usa HS256, inclui `sub`, `user_id`, `username`, `role`, `iat` e `exp`, e expira em 12 horas. A API rejeita token ausente, formato de Authorization incorreto, assinatura/claims inválidos, token expirado e funcionário desativado. A função de autenticação consulta o funcionário no banco em cada requisição para reconhecer imediatamente uma desativação ou alteração de perfil.

## Executar localmente

Na pasta do repositório:

```bash
python -m venv .venv
```

Ative o ambiente virtual e instale as dependências já declaradas pelo projeto:

```bash
pip install -r requirements.txt
```

Copie `.env.example` para `.env` e execute:

```bash
python run.py
```

Em desenvolvimento, a aplicação gera segredos temporários se `SECRET_KEY` e `JWT_SECRET_KEY` estiverem vazios. Como eles mudam quando a aplicação reinicia, tokens de desenvolvimento deixam de valer após o reinício. Em produção, ambos os segredos devem ser definidos no ambiente de deploy, aleatórios, diferentes entre si e com pelo menos 32 caracteres cada. Não faça commit do arquivo `.env`.

### Contas de demonstração — somente desenvolvimento/teste

| Usuário | Senha | Perfil |
|---|---|---|
| `admin` | `admin123` | `admin` |
| `atendente` | `atendente123` | `atendente` |
| `barista` | `barista123` | `barista` |

A aplicação não cria essas contas automaticamente em produção. Antes de publicar, a equipe precisa combinar uma forma segura de cadastrar o primeiro funcionário autorizado no banco. A gestão de usuários e a recuperação de senhas continuam fora do escopo desta tarefa.

## Exemplos de requisição

Login:

```bash
curl -X POST http://127.0.0.1:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"atendente","password":"atendente123"}'
```

Após copiar `data.token` da resposta, cadastrar item:

```bash
curl -X POST http://127.0.0.1:5000/api/v1/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{"name":"Café coado","description":"Café do dia","price":5.5,"category":"bebidas"}'
```

Consultar o cardápio continua público:

```bash
curl http://127.0.0.1:5000/api/v1/products
```

## Uso no React — para o Integrante 10

Depois de fazer login, mantenha o token no estado/contexto de autenticação da aplicação e envie-o em cada `POST`, `PUT` ou `DELETE` administrativo. Não envie senha em chamadas subsequentes.

```javascript
const API_URL = "http://127.0.0.1:5000/api/v1";

async function login(username, password) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || "Não foi possível fazer login.");
  }

  // Guarde em estado/contexto React; evite persistir tokens em localStorage
  // sem avaliar o risco de XSS da aplicação.
  return body.data; // { token, token_type, expires_in, user }
}

async function cadastrarProduto(token, produto) {
  const response = await fetch(`${API_URL}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(produto),
  });
  const body = await response.json();

  if (response.status === 401) {
    // Token ausente, inválido ou expirado: pedir novo login.
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!response.ok) {
    throw new Error(body.error || "Não foi possível cadastrar o produto.");
  }
  return body.data;
}
```

`PUT` e `DELETE` usam a mesma propriedade `Authorization`; altere apenas método e URL. Para a consulta pública `GET /products`, nenhum token é necessário.

## Testes

Os testes novos ficam em `tests/test_auth_task06.py`. Para executar a suíte completa do projeto:

```bash
pytest -q
```

Os casos da tarefa cobrem login válido/inválido, payload incompleto, consulta pública, `POST`/`PUT`/`DELETE` sem token, token malformado/inválido/expirado, permissão por perfil, funcionário desativado e perfil autenticado.
