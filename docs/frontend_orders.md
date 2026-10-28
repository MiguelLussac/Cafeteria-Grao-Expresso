# Integração React / Flask — Sprint 2

## Funções disponíveis

Importe de `frontend/src/services/api.js`; não use `fetch` nos componentes.
Todas as funções retornam somente `data` do envelope Flask e lançam `ApiError`.
Os nomes de campos permanecem em `snake_case`, iguais aos do backend.

| Função | HTTP (prefixo `/api/v1`) | Retorno | JWT |
|---|---|---|---|
| `createOrder(order)` | `POST /orders` | Pedido com itens e `payment: null` | Não |
| `listOrders({ status, limit } = {})` | `GET /orders` | Array de resumos; sem envelope `count` | Não |
| `getOrder(id)` | `GET /orders/{id}` | Pedido completo, itens e pagamento | Não |
| `registerSimulatedPayment(id, { method, amount? })` | `POST /orders/{id}/payment` | Pagamento com `payment_id` | Não |
| `updateOrderStatus(id, status)` | `PATCH /orders/{id}/status` | `{ id, status, updated_at }` | Sim |

```js
import {
  createOrder, listOrders, getOrder, registerSimulatedPayment,
  updateOrderStatus, ApiError,
} from './services/api' // ajuste o caminho relativo à tela

try {
  const order = await createOrder({
    customer_name: 'Mariana',
    table_number: 'Mesa 04',
    notes: 'Sem açúcar',
    items: [{ product_id: 1, quantity: 2 }],
  })
  await registerSimulatedPayment(order.id, { method: 'pix' })
  const details = await getOrder(order.id)
  const summaries = await listOrders({ status: 'recebido', limit: 50 })
  // Na cozinha, após login como barista, atendente ou admin:
  const updated = await updateOrderStatus(order.id, 'em_preparo')
  // Use details, summaries e updated para atualizar o estado da tela.
} catch (error) {
  if (error instanceof ApiError) {
    // Exiba error.message no Alert da tela; error.status identifica o HTTP.
    // status 0: conexão; 400: entrada; 403: permissão; 404: inexistente.
    // No 401 autenticado, o serviço limpa a sessão e emite grao:auth-expired.
    console.error(error.status, error.message)
  } else {
    throw error
  }
}
```

O total e os preços dos itens vêm do servidor. Envie IDs e quantidades inteiras
positivas; não envie totais calculados pela tela. `amount` omitido usa o total
do pedido. Após pagar, consulte `getOrder` para atualizar o pagamento na tela.
A atualização de status retorna apenas três campos: combine-os com o estado
existente ou recarregue os detalhes. Valores aceitos estão em
[api_contracts.md](api_contracts.md).

## Conferência dos contratos e alinhamento

Fonte conferida: `app/routes/orders.py`, `app/routes/payments.py`, modelos
`Order`, `OrderItem`, `Payment` e decorator de papéis JWT.

| Diferença encontrada | Decisão de integração |
|---|---|
| Datas documentadas com `Z`, implementação sem fuso explícito | Documentação reflete o ISO UTC sem sufixo atual; ao exibir no navegador, interprete como UTC explicitamente |
| Listagem tem `count`, `notes`, `updated_at`; criação tem `items_count` | Campos documentados; serviço retorna `data`, como o CRUD de produtos |
| `items_count` poderia ser entendido como unidades | É número de linhas de itens; use `quantity` para unidades |
| `amount` e `quantity` eram obrigatórios no OpenAPI | Corrigidos para opcionais; padrões total do pedido e 1 |
| Consulta de pagamento não documentada | Endpoint documentado; detalhes do pedido já bastam para as telas |
| SSE documentava `timestamp` | Corrigido para `updated_at` no evento de status |

O contrato técnico foi conciliado com o backend existente e verificado por
testes HTTP. **A confirmação dos integrantes do backend permanece pendente**:
não houve contato com a equipe nesta execução. Para fechar o alinhamento humano,
compartilhe este guia e confirme os campos das telas de pedido, fila e pagamento.

Limitações observadas no backend para revisão da equipe: corpos de criação com
tipos inesperados podem causar `500` em vez de `400`; `limit` da listagem geral
não tem faixa validada. Os cards 4/5 passaram a exigir pagamento igual ao total
e sequência de status. Para a cozinha, integrar `GET /orders/kitchen` com JWT,
em vez da listagem geral; protocolo SSE em [kitchen_sse.md](kitchen_sse.md).
O serviço preserva esses erros como `ApiError`; não adiciona regras divergentes
no frontend. Uma mudança nessas regras exige atualizar backend, contrato e testes.

## Testes

- `cd frontend && npm test`: serviço JS com respostas HTTP controladas;
  verifica URLs, filtros, corpos, retorno `data`, JWT, 400/401/403/404/500,
  falha de rede e resposta de erro sem JSON.
- `python -m pytest -q`: suíte Flask e teste de integração do serviço JS com
  Flask real via HTTP, usando SQLite em memória, porta local dinâmica e Node.js
  20+. Não usa banco de desenvolvimento ou produção.
- `cd frontend && npm run build` e `npm run lint`: verificações do frontend.

Para executar pytest, instale as dependências de `requirements.txt` no ambiente
Python. Os testes JS usam o runner nativo do Node, sem dependências adicionais.

## Resultado da validação

- Serviço JavaScript: **13 testes passaram** (`node --test tests/*.test.js`).
- Suíte Python: **62 testes passaram**, incluindo comunicação JS/Flask real.
- `npm run lint`: passou sem apontamentos.
- `npm run build`: compilação de produção concluída.
- `git diff --check`: passou.

A suíte Python emitiu avisos de depreciação existentes no backend
(`datetime.utcnow` e `Query.get`), sem falhas.

| Critério de conclusão | Resultado |
|---|---|
| Contratos Sprint 2 alinhados entre frontend e backend | Compatibilidade técnica aceita; confirmação dos integrantes pendente |
| Funções HTTP disponíveis | Aceito: cinco funções exportadas em `api.js` |
| Padrão de comunicação existente | Aceito: mesmo `request`, envelope `data` e JWT |
| Erros da API tratados | Aceito: `ApiError`, status HTTP, falha de rede e sessão expirada testados |
| Funções testadas | Aceito: testes do serviço e integração HTTP com Flask |

As alterações estão no repositório local; disponibilização pelo remoto depende
de commit/push e revisão da equipe.
