# Cards 4 e 5 — Cozinha e eventos

Base inspecionada: `origin/main`, commit `b698c0b`.

## Dependência com Card 3

O pagamento simulado já existe. `Payment.status == pago` é a fonte da liberação:
não há coluna nova nem migração. O ajuste mínimo valida valor positivo, finito e
igual ao total, impede pagar pedido cancelado/fora de recebido e publica
`new_order` somente depois do commit. Omitir `amount` ou enviar `null` continua
usando o total. O nome do evento e o formato da resposta de pagamento permanecem.

## Fila e status

`GET /api/v1/orders/kitchen`, com JWT de barista, atendente ou admin, retorna
`{success, count, data}`. Cada pedido inclui número `id`, produtos e quantidades
em `items`, observações do pedido em `notes`, status, datas e pagamento.
São incluídos apenas pagamentos pagos e pedidos recebido/em_preparo/pronto,
ordenados por `paid_at` e `id` crescentes, sem limite implícito. A chegada à
cozinha ocorre no pagamento, independentemente da criação do pedido.

O filtro opcional `status` aceita esses três status. Observações são do pedido,
conforme modelo existente; não foi criado campo por item.

`PATCH /api/v1/orders/{id}/status` mantém JWT e perfis existentes:

| Origem | Destinos permitidos |
|---|---|
| recebido | em_preparo, cancelado |
| em_preparo | pronto, cancelado |
| pronto | entregue |
| entregue / cancelado | nenhum |

Avanços exigem pagamento pago. Cancelar não exige pagamento. Dados inválidos
retornam 400; transição inválida, repetida ou conflito de atualização retorna
409. Uma atualização condicional pelo status anterior impede que dois avanços
do mesmo estado tenham sucesso. Nenhum evento é emitido antes do commit.

## Eventos e recuperação no cliente (Card 10)

`GET /api/v1/events/orders` mantém o stream público existente.

| Evento | Momento / conteúdo |
|---|---|
| connected | Toda conexão: resync_required=true e state_url=/api/v1/orders/kitchen |
| new_order | Pagamento persistido: order_id e pedido completo, incluindo itens e pagamento |
| order_status_updated | Mudança persistida: order_id, customer_name, table_number, status, updated_at |
| order_ready | Mesmo conteúdo de status, ao chegar a pronto |

O servidor envia `retry: 3000` e comentários `: heartbeat` após 15s ociosos.
Ao fechar o stream, remove a inscrição. Se a fila de um cliente atingir 100
mensagens, ela é removida e o stream encerra, permitindo reconexão automática.

Protocolo recomendado para o painel:

1. Abrir o SSE e registrar os listeners, incluindo `connected`.
2. Em **todo** `connected`, buscar `state_url` com `Authorization: Bearer <JWT>`
   e substituir a fila local pelo snapshot. Em 401, renovar a sessão por login.
3. Tratar os eventos como invalidação e buscar novamente a fila. Serializar
   consultas e marcar outra atualização pendente caso chegue evento durante uma
   consulta; isso evita que respostas antigas sobrescrevam estado mais recente.
4. Em desconexão, indicar perda de conexão, permitir a reconexão do EventSource
   e repetir a recuperação. O stream é inscrito antes de enviar `connected`;
   eventos ocorridos durante a consulta ficam enfileirados.

Não há replay nem IDs duráveis de eventos; `Last-Event-ID` não recupera histórico.
A API persiste o estado e é a fonte de verdade após eventos perdidos ou reinício.
O stream pode continuar com clientes públicos existentes; o painel consulta a
fila protegida com JWT. Não enviar tokens em query strings.

## Validação e limites

Executar `python -m pytest -q` (inclui integração HTTP do serviço JS/Flask) e
`node --test frontend/tests/*.test.js` a partir do ambiente correspondente.
Os testes novos ficam em `tests/test_kitchen_sse.py`.

Validação em 28/10/2026, executada por grupos:

- 62 testes existentes aprovados (61 na suíte local e a integração HTTP
  JS/Flask em execução separada com conexão local permitida).
- 61 testes novos aprovados: 59 na execução inicial e os dois casos adicionais
  na execução direcionada, que também repetiu a verificação de pagamento pendente/cancelado.
- 13 testes JavaScript aprovados.
- `git diff --check` aprovado. O remoto continuava em `b698c0b` na conferência final.

A tentativa inicial da integração HTTP falhou por bloqueio da conexão local no
ambiente restrito; a mesma integração passou com a conexão permitida, sem
alterar código ou testes. Permanecem avisos de depreciação de `Query.get` e
`datetime.utcnow`; não houve refatoração desses usos fora do escopo.

O broker continua em memória e depende do único worker já previsto pelo projeto.
Múltiplos processos exigiriam infraestrutura compartilhada, fora deste escopo.
A recuperação depende da persistência do banco; SQLite efêmero do deploy atual
não preserva pedidos após recriação do ambiente. O stream público existente
expõe dados de pedidos: restringi-lo exige alinhar consumidores e autenticação.
Não houve mudança de dependências, infraestrutura, frontend ou Trello.
