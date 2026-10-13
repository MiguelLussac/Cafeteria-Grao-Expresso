# Contratos da API REST — Cafeteria Grão Expresso
**Versão:** 1.0.0  
**Prefixo Base:** `/api/v1`  
**Formato de Dados:** `application/json`

---

## 1. Padrões Gerais e Respostas de Erro

### Cabeçalhos Padrão
- Requisições com corpo: `Content-Type: application/json`
- Requisições autenticadas: `Authorization: Bearer <jwt-token>`

### Formato Padrão de Erro
Todas as respostas de erro retornam um JSON padronizado:
```json
{
  "success": false,
  "error": "Descrição clara do erro",
  "status_code": 400
}
```

### Códigos HTTP Utilizados
- `200 OK`: Requisição bem-sucedida.
- `201 Created`: Recurso criado com sucesso.
- `400 Bad Request`: Parâmetros inválidos ou corpo da requisição malformado.
- `401 Unauthorized`: Token JWT ausente, expirado ou inválido.
- `403 Forbidden`: Usuário autenticado não possui privilégios para a ação.
- `404 Not Found`: Recurso solicitado não foi encontrado.
- `500 Internal Server Error`: Erro inesperado do servidor.

---

## 2. Autenticação (`/api/v1/auth`)

### 2.1 Login de Usuário
- **Endpoint:** `POST /api/v1/auth/login`
- **Acesso:** Público (Equipe de atendentes e baristas)
- **Request Body:**
```json
{
  "username": "atendente",
  "password": "atendente123"
}
```
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": 2,
      "username": "atendente",
      "role": "atendente"
    }
  }
}
```

### 2.2 Perfil do Usuário Autenticado
- **Endpoint:** `GET /api/v1/auth/me`
- **Acesso:** Requer Token JWT (`Authorization: Bearer <token>`)
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "id": 2,
    "username": "atendente",
    "role": "atendente"
  }
}
```

---

## 3. Cardápio / Produtos (`/api/v1/products`)

### 3.1 Listar Produtos
- **Endpoint:** `GET /api/v1/products`
- **Acesso:** Público (Totem / Atendente / Cozinha)
- **Query Params:**
  - `category` *(opcional)*: `bebidas` | `doces` | `salgados`
  - `active_only` *(opcional, default: `true`)*: `true` | `false`
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Café Expresso Tradicional",
      "description": "Café expresso encorpado 50ml",
      "price": 6.50,
      "category": "bebidas",
      "is_active": true
    },
    {
      "id": 2,
      "name": "Pão de Queijo Mineiro",
      "description": "Pão de queijo quentinho com queijo canastra",
      "price": 7.00,
      "category": "salgados",
      "is_active": true
    }
  ]
}
```

### 3.2 Obter Produto por ID
- **Endpoint:** `GET /api/v1/products/{id}`
- **Acesso:** Público
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Café Expresso Tradicional",
    "description": "Café expresso encorpado 50ml",
    "price": 6.50,
    "category": "bebidas",
    "is_active": true
  }
}
```

### 3.3 Criar Novo Produto
- **Endpoint:** `POST /api/v1/products`
- **Acesso:** Requer JWT com role `admin` ou `atendente`
- **Request Body:**
```json
{
  "name": "Capuccino Italiano",
  "description": "Café expresso, leite vaporizado e canela",
  "price": 12.00,
  "category": "bebidas"
}
```
- **Response `201 Created`:**
```json
{
  "success": true,
  "data": {
    "id": 3,
    "name": "Capuccino Italiano",
    "description": "Café expresso, leite vaporizado e canela",
    "price": 12.00,
    "category": "bebidas",
    "is_active": true
  }
}
```

### 3.4 Atualizar Produto
- **Endpoint:** `PUT /api/v1/products/{id}`
- **Acesso:** Requer JWT com role `admin` ou `atendente`
- **Request Body:**
```json
{
  "name": "Capuccino Italiano Especial",
  "price": 13.50,
  "is_active": true
}
```
- **Response `200 OK`:** Retorna o objeto do produto atualizado.

### 3.5 Desativar / Excluir Produto
- **Endpoint:** `DELETE /api/v1/products/{id}`
- **Acesso:** Requer JWT com role `admin`
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Produto desativado com sucesso"
}
```

---

## 4. Pedidos (`/api/v1/orders`)

### 4.1 Criar Novo Pedido
- **Endpoint:** `POST /api/v1/orders`
- **Acesso:** Público (Totem de autoatendimento) ou Atendente
- **Request Body:**
```json
{
  "customer_name": "Mariana Silva",
  "table_number": "Mesa 04",
  "notes": "Café sem açúcar",
  "items": [
    {
      "product_id": 1,
      "quantity": 2
    },
    {
      "product_id": 2,
      "quantity": 1
    }
  ]
}
```
- **Response `201 Created`:**
```json
{
  "success": true,
  "data": {
    "id": 101,
    "customer_name": "Mariana Silva",
    "table_number": "Mesa 04",
    "notes": "Café sem açúcar",
    "status": "recebido",
    "total_amount": 20.00,
    "created_at": "2026-10-13T15:40:00Z",
    "updated_at": "2026-10-13T15:40:00Z",
    "items": [
      {
        "id": 1,
        "product_id": 1,
        "product_name": "Café Expresso Tradicional",
        "quantity": 2,
        "unit_price": 6.50,
        "subtotal": 13.00
      },
      {
        "id": 2,
        "product_id": 2,
        "product_name": "Pão de Queijo Mineiro",
        "quantity": 1,
        "unit_price": 7.00,
        "subtotal": 7.00
      }
    ],
    "payment": null
  }
}
```

### 4.2 Listar Pedidos
- **Endpoint:** `GET /api/v1/orders`
- **Acesso:** Público ou Atendente/Cozinha
- **Query Params:**
  - `status`: `recebido` | `em_preparo` | `pronto` | `entregue` | `cancelado`
  - `limit`: *(int, default: 50)*
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "customer_name": "Mariana Silva",
      "table_number": "Mesa 04",
      "status": "recebido",
      "total_amount": 20.00,
      "created_at": "2026-10-13T15:40:00Z",
      "items_count": 2
    }
  ]
}
```

### 4.3 Consultar Pedido por ID
- **Endpoint:** `GET /api/v1/orders/{id}`
- **Acesso:** Público (usado pelo cliente para acompanhar status)
- **Response `200 OK`:** Retorna o pedido completo com lista de itens e pagamento.

### 4.4 Atualizar Status do Pedido
- **Endpoint:** `PATCH /api/v1/orders/{id}/status`
- **Acesso:** Requer JWT com role `barista`, `atendente` ou `admin`
- **Request Body:**
```json
{
  "status": "em_preparo"
}
```
*Valores aceitos:* `recebido`, `em_preparo`, `pronto`, `entregue`, `cancelado`.
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Status atualizado com sucesso",
  "data": {
    "id": 101,
    "status": "em_preparo",
    "updated_at": "2026-10-13T15:45:00Z"
  }
}
```
*(Nota: Ao mudar para `pronto`, um evento SSE é disparado automaticamente para avisar o cliente e o totem).*

---

## 5. Pagamento Simulado (`/api/v1/orders/{id}/payment`)

### 5.1 Registrar Pagamento Simulado
- **Endpoint:** `POST /api/v1/orders/{id}/payment`
- **Acesso:** Público ou Atendente (conforme fluxo de totem)
- **Request Body:**
```json
{
  "method": "pix",
  "amount": 20.00
}
```
*Valores aceitos para `method`:* `dinheiro`, `cartao`, `pix`.
- **Response `201 Created`:**
```json
{
  "success": true,
  "data": {
    "payment_id": 55,
    "order_id": 101,
    "method": "pix",
    "amount": 20.00,
    "status": "pago",
    "paid_at": "2026-10-13T15:41:00Z"
  }
}
```

---

## 6. Notificações em Tempo Real via SSE (`/api/v1/events`)

### 6.1 Stream de Eventos de Pedidos
- **Endpoint:** `GET /api/v1/events/orders`
- **Protocolo:** Server-Sent Events (`text/event-stream`)
- **Acesso:** Público
- **Comportamento:** Mantém a conexão aberta e envia mensagens sempre que um pedido é criado ou tem seu status alterado.
- **Formato dos Eventos Emitidos:**
```text
event: order_status_updated
data: {"order_id": 101, "customer_name": "Mariana Silva", "table_number": "Mesa 04", "status": "pronto", "timestamp": "2026-10-13T15:50:00Z"}
```

---

## 7. Health Check (`/api/v1/health`)

- **Endpoint:** `GET /api/v1/health`
- **Acesso:** Público
- **Response `200 OK`:**
```json
{
  "status": "healthy",
  "service": "Cafeteria Grao Expresso API",
  "version": "1.0.0"
}
```
