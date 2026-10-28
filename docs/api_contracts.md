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
- **Alias compatível com o quadro da sprint:** `POST /api/v1/cadastrar-produto/`
- **Acesso:** Requer JWT com role `admin` ou `atendente`
- **Campos obrigatórios:** `name` (texto não vazio, até 120 caracteres), `price` (número positivo, até duas casas decimais) e `category` (`bebidas`, `doces` ou `salgados`).
- **Campo opcional:** `description` (texto).
- **Request Body:**
```json
{
  "name": "Capuccino Italiano",
  "description": "Café expresso, leite vaporizado e canela",
  "price": 12.00,
  "category": "bebidas"
}
```
- Valores ausentes, campos com formato inválido, categoria não permitida e preços zero/negativos são rejeitados com `400 Bad Request`.
- Falhas ao persistir no banco retornam `500 Internal Server Error` sem expor detalhes internos.
- **Response `201 Created`:**
```json
{
  "success": true,
  "message": "Produto criado com sucesso.",
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
O registro retornado pode ser consultado por `GET /api/v1/products/{id}`.

### 3.4 Atualizar Produto
- **Endpoint:** `PUT /api/v1/products/{id}`
- **Acesso:** Requer JWT com role `admin` ou `atendente`
- Os mesmos validadores de nome, preço e categoria do cadastro também são aplicados na edição.
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

Os formatos abaixo correspondem às rotas e aos modelos Flask atuais. Guia de uso no React,
diferenças encontradas e pendências de validação da equipe: [Integração Sprint 2](frontend_orders.md).
As datas de pedidos/pagamentos são strings ISO 8601 em UTC **sem sufixo de fuso**
(ex.: `2026-10-13T15:40:00`), conforme `datetime.utcnow().isoformat()` do backend.

### 4.1 Criar Novo Pedido
- **Endpoint:** `POST /api/v1/orders`
- **Acesso:** Público (Totem de autoatendimento) ou Atendente
- **Campos:** `items` é uma lista não vazia com `product_id` de produto ativo e
  `quantity` inteiro positivo (padrão `1` quando omitido). `customer_name`,
  `table_number` e `notes` são textos opcionais; omitidos/vazios resultam em
  `"Balcão"`, `"Retirada"` e `""`. Preços e total são calculados pelo backend.
- **Erros:** `400` para lista vazia, quantidade não positiva ou produto inexistente/inativo.
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
    "created_at": "2026-10-13T15:40:00",
    "updated_at": "2026-10-13T15:40:00",
    "items_count": 2,
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
  "count": 1,
  "data": [
    {
      "id": 101,
      "customer_name": "Mariana Silva",
      "table_number": "Mesa 04",
      "notes": "Café sem açúcar",
      "status": "recebido",
      "total_amount": 20.00,
      "created_at": "2026-10-13T15:40:00",
      "updated_at": "2026-10-13T15:40:00",
      "items_count": 2
    }
  ]
}
```

### 4.3 Consultar Pedido por ID
- **Endpoint:** `GET /api/v1/orders/{id}`
- **Acesso:** Público (usado pelo cliente para acompanhar status)
- **Response `200 OK`:** Retorna o pedido completo com lista de itens e pagamento.
- **Erro:** `404` para pedido inexistente. `items_count` conta linhas de itens,
  não a soma das quantidades. A listagem não inclui `items` nem `payment`.

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
    "updated_at": "2026-10-13T15:45:00"
  }
}
```
*(Nota: Ao mudar para `pronto`, um evento SSE é disparado automaticamente para avisar o cliente e o totem).*
Transições permitidas: `recebido → em_preparo → pronto → entregue`;
cancelamento a partir de `recebido` ou `em_preparo`. `entregue` e `cancelado`
são terminais. Repetições, saltos e retrocessos retornam `409`.
Avanços exigem pagamento `pago`; cancelar um pedido não pago é permitido.
Erros: `400` status inválido; `401` JWT ausente/inválido/expirado;
`403` perfil sem permissão; `404` pedido inexistente. O texto de `message` pode
variar; use os campos de `data`, não compare mensagens de sucesso.

### 4.5 Fila da cozinha e recuperação de estado
- **Endpoint:** `GET /api/v1/orders/kitchen`
- **Acesso:** JWT de `barista`, `atendente` ou `admin`.
- Retorna `{success, count, data}` com pedidos completos (mesmos campos da
  consulta por ID), incluindo número `id`, `items[].product_name`,
  `items[].quantity`, observações do pedido em `notes` e pagamento.
- Somente pagamento `pago` e status `recebido`, `em_preparo` ou `pronto`.
- Ordenação crescente por `payment.paid_at`, com desempate por `id`;
  representa a chegada à cozinha após liberação. Sem truncamento ou limite padrão.
- `status` opcional aceita apenas os três status da fila; demais valores retornam `400`.
- A listagem geral `GET /orders` mantém seu contrato anterior e não representa a fila.
- Guia de integração e reconexão: [Cozinha e SSE](kitchen_sse.md).

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
`method` é obrigatório; `amount` é opcional. Omitido ou `null`, usa o total do
pedido. Nas telas, prefira omiti-lo. Valor explícito deve ser finito, positivo e
igual ao total. Erros: `400` método/valor inválido ou pagamento já registrado;
`404` pedido inexistente; `409` pedido fora de `recebido`.
Somente após persistir o pagamento é emitido `new_order`, liberando para a cozinha.
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
    "paid_at": "2026-10-13T15:41:00"
  }
}
```

---

### 5.2 Consultar Pagamento
- **Endpoint:** `GET /api/v1/orders/{id}/payment`
- **Acesso:** Público.
- **Response `200 OK`:** Envelope `{ "success": true, "data": ... }` com o
  mesmo objeto de pagamento da seção 5.1.
- **Erro:** `404` para pedido inexistente ou sem pagamento. No React,
  `getOrder(id)` já inclui `payment` (objeto ou `null`).

## 6. Notificações em Tempo Real via SSE (`/api/v1/events`)

### 6.1 Stream de Eventos de Pedidos
- **Endpoint:** `GET /api/v1/events/orders`
- **Protocolo:** Server-Sent Events (`text/event-stream`)
- **Acesso:** Público
- **Comportamento:** Mantém a conexão aberta. `new_order` é emitido após o pagamento
  persistido, com `order_id` e o pedido completo; criar sem pagar não emite evento.
  `order_status_updated` é emitido após mudança persistida e `order_ready` também
  é emitido ao chegar a `pronto`. Operações rejeitadas não emitem eventos.
- `connected` inclui `resync_required: true` e `state_url: /api/v1/orders/kitchen`;
  em toda conexão/reconexão, consultar essa API com JWT. O stream permanece público,
  conforme contrato existente. Não enviar JWT na URL.
- `retry: 3000` orienta reconexão; comentários de heartbeat a cada 15 segundos ociosos.
  Não há histórico/replay via `Last-Event-ID`. Em fila saturada, o stream encerra
  para forçar reconexão e recuperação por API. Ver [protocolo de recuperação](kitchen_sse.md).
- **Formato dos Eventos Emitidos:**
```text
event: order_status_updated
data: {"order_id": 101, "customer_name": "Mariana Silva", "table_number": "Mesa 04", "status": "pronto", "updated_at": "2026-10-13T15:50:00"}
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
