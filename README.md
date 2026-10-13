# Cafeteria Grão Expresso - Backend API

API RESTful para o Sistema de Pedidos da Cafeteria Grão Expresso (Squad 50).
Desenvolvida em **Python 3 + Flask**, seguindo a arquitetura definida no **Documento de Arquitetura de Solução (DAS)**.

---

## 📌 Visão Geral da Arquitetura

O sistema adota uma **arquitetura em camadas com API REST**:
- **Apresentação (Routes/Blueprints):** Endpoints REST que servem tanto ao Totem/Atendente quanto ao Painel da Cozinha.
- **Serviços / Regras de Negócio (Services & Utils):** Lógica de pedidos, cálculo de valores, autenticação JWT e eventos em tempo real via Server-Sent Events (SSE).
- **Dados (Models / SQLAlchemy):** Entidades relacionais (Produtos, Pedidos, Itens de Pedido, Pagamentos e Usuários) compatíveis com **MySQL** (produção) e **SQLite** (desenvolvimento local).

---

## 📁 Estrutura de Pastas

```text
Cafeteria-Grao-Expresso/
├── app/
│   ├── models/            # Entidades do banco de dados (SQLAlchemy)
│   │   ├── user.py        # Usuários e perfis de acesso (Atendente, Barista, Admin)
│   │   ├── product.py     # Cardápio (Bebidas, Doces, Salgados)
│   │   ├── order.py       # Pedidos e Itens do Pedido (status: recebido, em_preparo, pronto)
│   │   └── payment.py     # Registro de pagamento simulado
│   ├── routes/            # Controladores REST (Blueprints)
│   │   ├── auth.py        # /api/v1/auth (Login e JWT)
│   │   ├── products.py    # /api/v1/products (CRUD de cardápio)
│   │   ├── orders.py      # /api/v1/orders (Criação, listagem e atualização de status)
│   │   ├── payments.py    # /api/v1/orders/<id>/payment (Simulação de pagamento)
│   │   ├── events.py      # /api/v1/events/orders (Stream SSE para notificação em tempo real)
│   │   └── health.py      # /api/v1/health (Health check)
│   ├── services/          # Regras de negócio e pub/sub de SSE
│   │   └── sse_service.py # Gerenciamento de eventos de pedidos em tempo real
│   ├── utils/             # Utilitários (Decorators JWT, handlers de erro)
│   │   ├── auth_decorator.py
│   │   └── error_handlers.py
│   ├── config.py          # Configurações por ambiente (Dev, Test, Prod)
│   ├── extensions.py      # Instâncias de extensões Flask (SQLAlchemy, CORS, Migrate)
│   └── __init__.py        # Application Factory (create_app)
├── docs/
│   ├── sprint_planning.md # Planejamento completo da Sprint e backlog
│   ├── api_contracts.md   # Contratos detalhados da API REST
│   └── openapi.yaml       # Especificação OpenAPI 3.0 / Swagger
├── tests/                 # Testes automatizados (pytest)
│   ├── conftest.py
│   └── test_api.py
├── .env.example           # Modelo de variáveis de ambiente
├── .gitignore
├── requirements.txt       # Dependências do projeto
├── run.py                 # Ponto de entrada para execução da aplicação
└── README.md
```

---

## 🚀 Como Executar o Projeto

### 1. Pré-requisitos
- Python 3.10 ou superior instalado.
- Git instalado.

### 2. Clonar o repositório e acessar a pasta
```bash
git clone https://github.com/MiguelLussac/Cafeteria-Grao-Expresso.git
cd Cafeteria-Grao-Expresso
```

### 3. Criar e ativar o ambiente virtual (venv)
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux / MacOS
python3 -m venv venv
source venv/bin/activate
```

### 4. Instalar as dependências
```bash
pip install -r requirements.txt
```

### 5. Configurar as variáveis de ambiente
Copie o arquivo de exemplo `.env.example` para `.env`:
```bash
cp .env.example .env
```
*(No Windows PowerShell: `Copy-Item .env.example .env`)*

### 6. Executar a aplicação
```bash
python run.py
```
A API iniciará por padrão em `http://127.0.0.1:5000`.

O banco de dados SQLite local (`grao_expresso.db`) será criado automaticamente com dados semente (usuários de teste e itens de cardápio).

---

## 🔑 Usuários Padrão para Teste

Ao iniciar em modo de desenvolvimento, o sistema cria automaticamente os usuários:

| Usuário | Senha | Perfil (Role) | Permissão |
|---|---|---|---|
| `admin` | `admin123` | `admin` | Acesso total |
| `atendente` | `atendente123` | `atendente` | Criação de pedidos, pagamentos, cardápio |
| `barista` | `barista123` | `barista` | Visualização e atualização de status de pedidos |

---

## 🧪 Executando os Testes Automatizados

Para rodar a suíte de testes com `pytest`:
```bash
pytest -v
```

---

## 📖 Documentação da API

- **Contratos da API em Markdown:** Consulte [`docs/api_contracts.md`](docs/api_contracts.md).
- **Especificação OpenAPI / Swagger:** Consulte [`docs/openapi.yaml`](docs/openapi.yaml).
- **Planejamento da Sprint:** Consulte [`docs/sprint_planning.md`](docs/sprint_planning.md).