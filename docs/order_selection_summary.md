# Sprint 2 — Cards 6 e 7

Base: `origin/main` em `a2cf5b2`, incluindo os merges dos cards 2/3, 4/5 e os
arquivos inicialmente vazios do Card 6. Nenhuma dependência, configuração de
infraestrutura, rota Flask ou quadro Trello foi alterado nesta implementação.

## Fluxo

1. No cardápio `/`, adicionar produtos ativos à seleção. Repetir a adição
   aumenta a quantidade da mesma linha.
2. Alterar quantidades inteiras positivas pelos botões ou campo numérico;
   remover um item pela ação específica. O contador soma unidades.
3. Abrir `/pedido/resumo`: nomes, quantidades, preços unitários, subtotais e
   total estimado; identificação opcional e observações gerais (`notes`).
4. Voltar para revisar sem perder itens ou os textos preenchidos.
5. Confirmar por `createOrder` de `services/api.js`. Envia apenas IDs,
   quantidades e os textos; preço e total são calculados pela API.
6. Seguir para `/pedido/{id}/pagamento`, preservando o ID retornado. A página
   consulta o pedido pela API e apresenta o total definitivo do servidor.

`OrderContext` compartilha seleção, textos, andamento e pedido criado. A seleção
é temporária, em memória: sobrevive à navegação interna, mas não ao recarregamento
da página. O pedido criado permanece no backend e sua URL permite consultá-lo.

Pedidos vazios não podem ser confirmados. Produtos inativos não aparecem nas
novas seleções e são rejeitados também pelo estado local. A API continua sendo
responsável por validar disponibilidade e preço no momento da criação.

Uma promessa compartilhada bloqueia POSTs simultâneos. Após sucesso, a mesma
confirmação reutiliza o pedido criado. Voltar ao cardápio permite consultar o
pedido ou iniciar explicitamente outro, reiniciando a seleção.

## Integração com Card 8

Após a integração com o PR dos cards 8/9/10, `PaymentPage.jsx` é o ponto de
entrada para a próxima etapa, em `/pedido/:id/pagamento`. A tela provisória
`OrderPaymentPage.jsx` foi substituída pela implementação de pagamento do Card 8.
O resumo encaminha o ID retornado pela criação; o pagamento consulta itens e
total definitivo pela API. Registrar o pedido não confirma seu pagamento.

## Erros e limites

Erros da API são apresentados sem apagar a seleção e os campos. Após falha,
é possível corrigir itens e tentar novamente. Durante envio, controles ficam
desabilitados; a proteção contra duplicação também existe fora do botão.

Essa proteção cobre cliques/envios simultâneos e repetição após sucesso no
mesmo fluxo. Não garante idempotência se o servidor gravar o pedido e a resposta
se perder na rede: uma garantia entre recarregamentos/dispositivos precisaria
de suporte específico do backend. Não foi alterado o contrato para isso.

## Verificação

- `npm test`: 23 testes aprovados, incluindo seleção, quantidades, remoção,
  totais, corpo da confirmação, duplicação e erros 0/400/500 com nova tentativa.
- `npm run lint` e `npm run build`: aprovados.
- `python -m pytest -q --disable-warnings`: 215 testes aprovados na base atualizada.
  Permanecem avisos de depreciação do backend, sem falhas.
- Integração real JS/Flask ampliada: aprovada; uma confirmação concorrente cria
  somente um pedido, o servidor ignora o preço local estimado, vários itens são
  persistidos e produto inexistente retorna 400 sem pedido parcial.
- Navegador com API e banco em memória: adição, alteração, remoção, rejeição de
  quantidade negativa, retorno ao cardápio preservando observações, criação de
  pedido com um produto, pedido com dois produtos/quantidades diferentes,
  falha temporária da API e sucesso na nova tentativa sem perder a seleção,
  bloqueio da confirmação com seleção vazia.

Não foi usado banco de desenvolvimento ou produção nos testes de interface.

`npm ci` sinalizou três vulnerabilidades de severidade alta na árvore de
dependências existente. O arquivo de dependências e o lockfile foram preservados;
as correções de dependências não fazem parte destes cards.
