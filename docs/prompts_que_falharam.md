# Exemplos de prompts que falharam (item 1.5)

## Exemplo 1: pedido de item fora do cardápio ficava sem resposta

**O que aconteceu.** Ao pedir ao assistente do totem que adicionasse ao pedido algo que não existe no cardápio, ele demorava muito e não devolvia mensagem nenhuma ao cliente.

**Como foi ajustado.** A IA passou a consultar o cardápio completo a cada mensagem relacionada ao pedido, para verificar se o item pedido existe antes de responder. No código, o cardápio ativo vai inteiro no prompt de sistema a cada chamada, e o prompt manda avisar que o item não existe e sugerir até 2 opções parecidas do cardápio.

**Como a equipe validou.** Reteste manual no totem, repetindo o pedido de um item inexistente. Como segurança extra, o backend descarta qualquer produto que não exista no cardápio ativo (`apply_changes`), mesmo que a IA o inclua na resposta.

## Exemplo 2: item removido pelo botão voltava ao pedido

**O que aconteceu.** Depois de a IA adicionar itens ao pedido, o cliente removia um deles pelo botão de remover da tela. Ao perguntar à IA o que havia no pedido, ela listava também o item removido, que voltava ao pedido. O item só saía de verdade quando o cliente pedia à IA para removê-lo.

**Causa.** A IA tratava o histórico da conversa como a memória do pedido, e o histórico não sabia das remoções feitas pelos botões.

**Como foi ajustado.**
1. O pedido que está na tela é enviado à IA junto de cada nova mensagem do cliente (`PEDIDO ATUAL NA TELA`) e vale como a única fonte da verdade.
2. O prompt passou a dizer que um item ausente da tela foi removido pelo cliente e não deve ser recolocado, a menos que ele peça de novo.
3. A IA deixou de devolver o pedido inteiro: devolve só as mudanças da última mensagem (`changes`), e o backend as aplica sobre o pedido da tela.

**Como a equipe validou.** Reteste manual: montar o pedido pelo chat, remover um item pelo botão e perguntar à IA o que há no pedido. A correção está no commit "Corrige item removido na tela voltando ao pedido pelo assistente".

## Como a equipe valida a saída da IA

Toda resposta passa por validação em código antes de chegar ao pedido: só produtos ativos do cardápio, quantidades inteiras de 1 a 20, nome e preço vindos do banco e formato JSON conferido. Detalhes em `ia_assistente_prompts.md`.
