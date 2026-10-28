# Cards 8, 9 e 10 — Pagamento simulado e painel da cozinha

## Card 8 — Tela de pagamento (`/pedido/:id/pagamento`)

`frontend/src/pages/PaymentPage.jsx`. Pública, sem login.

- Recebe o pedido pelo ID da rota e consulta `getOrder` (total e itens vêm do
  servidor). Enquanto os cards 6 e 7 não existem, crie o pedido via API e abra a
  URL; ao final do card 7 basta navegar para `/pedido/${order.id}/pagamento`.
- Formas: Dinheiro, Cartão e Pix. Envia somente `{ method }`; o Flask usa o total.
- Botão desabilitado e trava síncrona (`useRef`) impedem envio duplicado.
- A confirmação só aparece com resposta 201 **ou** se, após um erro, `getOrder`
  mostrar `payment.status === 'pago'` (ex.: rede caiu depois de o servidor gravar).
  Qualquer outro caso mostra "O pagamento não foi registrado".
- Pedido já pago abre direto na confirmação; pedido fora de `recebido` sem
  pagamento mostra aviso; inexistente mostra "Pedido não encontrado".
- O número exibido é o próprio ID do pedido.

## Card 9 — Interface do painel (`/cozinha`)

`frontend/src/pages/KitchenPage.jsx`. Exige login (barista, atendente ou admin);
link "Cozinha" no menu para usuários autenticados.

- Três colunas: Recebidos, Em preparo, Prontos. Cada cartão mostra número,
  cliente/mesa, itens com quantidade, observações e tempo desde o pagamento.
- Ordem por `paid_at` (chegada à cozinha); o mais antigo de cada coluna é
  destacado e pedidos com 10 min ou mais ficam marcados como "Atrasado".
- Ações: Iniciar preparo → Finalizar preparo → Marcar como entregue (remove da fila).
- Estados de carregando, coluna vazia, erro com "Tentar novamente" e falha de
  atualização mantendo os últimos dados. Fontes maiores a partir de 1600 px (TV);
  em telas estreitas as colunas empilham.
- Regras puras (agrupamento, ordenação, deduplicação, ações) em
  `frontend/src/utils/kitchen.js`.

## Card 10 — Integração e tempo real

`frontend/src/hooks/useKitchenQueue.js`, seguindo [kitchen_sse.md](kitchen_sse.md).
Novas funções em `services/api.js`: `listKitchenOrders` (JWT) e
`subscribeOrderEvents` (EventSource, sem token na URL).

- Todo `connected` e todo evento (`new_order`, `order_status_updated`,
  `order_ready`) disparam uma consulta a `GET /orders/kitchen`; o snapshot
  substitui a lista, então não há duplicação.
- Consultas serializadas (`createSerialRunner`): eventos durante uma consulta
  geram uma única consulta extra, e respostas antigas não sobrescrevem as novas.
- `PATCH /orders/{id}/status` só altera a tela após sucesso; erro aparece em
  alerta e 409 recarrega a fila. 401 encerra a sessão e volta ao login.
- Recuperação: consulta de segurança a cada 30 s. Se ela falhar por rede ou 5xx,
  o stream é reaberto em 5 s. Isso cobre streams "pendurados" — o proxy do Vite,
  por exemplo, mantém a conexão com o navegador aberta quando o Flask cai, e o
  heartbeat do servidor (comentário SSE) não é visível ao `EventSource`.

## Validação (28/10/2026)

- `npm test`: 24 testes (11 novos em `frontend/tests/kitchen.test.js`).
- `npm run lint` e `npm run build`: sem apontamentos.
- `python -m pytest -q`: 123 testes passaram.
- Manual no navegador (Flask + Vite, SQLite temporário): pagamento sem forma
  escolhida, Pix com duplo clique (um único POST), pedido já pago e inexistente;
  novo pedido pago aparecendo sem recarregar, transições até "pronto", mudança
  feita por outro cliente, queda do Flask (indicador "Sem conexão") e reconexão
  recuperando uma mudança feita enquanto o painel estava desconectado.

Observação: em desenvolvimento, com as chaves de exemplo do `.env`, o Flask gera
segredos novos a cada reinício, e os tokens antigos passam a receber 401 (o
painel volta ao login). Para não perder a sessão ao reiniciar, defina
`JWT_SECRET_KEY` no `.env` local.
