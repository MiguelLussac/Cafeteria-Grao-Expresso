# Edge Function `macros`: tabela nutricional automática

Quando um produto é cadastrado ou tem nome/descrição alterados, o Supabase chama a Edge Function `macros`, que estima a tabela nutricional média da porção com o Gemini (em `ml` para líquidos e `g` para o resto) e grava nas colunas de `products` com `nutrition_source = 'ai'`. O produto é salvo na hora e a tabela aparece alguns segundos depois; o cardápio e o admin se atualizam sozinhos enquanto houver produto "Calculando…".

```
Flask grava em products (nutrition_status = 'pending') ──► Database Webhook (INSERT/UPDATE)
                                                                    │
                                                                    ▼
                                                     Edge Function macros ──► Gemini
                                                                    │
                       UPDATE products SET serving_size, serving_unit, ..., nutrition_status = 'ready' | 'failed'
```

## Status da tabela (`nutrition_status`)

| Status | Significado | Quem define | Na tela |
|---|---|---|---|
| `pending` | Aguardando a IA | API: cadastro sem tabela, mudança de nome/descrição de produto com tabela da IA, "Tentar de novo" | "Calculando…" (vira "Indisponível" após 2 min sem resposta) |
| `ready` | Tabela preenchida | Edge Function (IA) ou API (tabela manual) | kcal, porção e macros |
| `failed` | A IA não conseguiu estimar | Edge Function | "Indisponível" + botão "Tentar de novo" no admin |

`ready` sempre tem tabela e `pending`/`failed` nunca têm: o banco garante isso por `CHECK constraint`. Ao mudar o nome ou a descrição, a estimativa antiga é descartada para não mostrar valores de outro produto.

## Regras

- **A IA só age em `pending`.** As gravações da própria função mudam o status para `ready` ou `failed`, então o webhook seguinte é ignorado (sem loop). Mudar só o preço ou a categoria não chama a IA.
- **Tabela manual nunca é sobrescrita.** Se `nutrition_source = 'manual'`, a função não faz nada; no admin, "Editar valores" torna a tabela manual e esvaziar todos os campos devolve o cálculo para a IA.
- **Validação em duas camadas:** a função confere a resposta da IA (`rules.ts`) e o banco recusa valores inválidos pelas `CHECK constraints` (migrações `a3c51e7d9b20` e `c7e2f4a91d36`).

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `supabase/functions/macros/index.ts` | Recebe o webhook, responde `202` e processa em segundo plano |
| `supabase/functions/macros/rules.ts` | Quando estimar e validação da resposta (sem dependências) |
| `supabase/functions/macros/estimate.ts` | Prompt e chamada ao Gemini (`@google/genai`, Interactions API) |
| `supabase/functions/macros/rules.test.ts` | Testes: `node --test supabase/functions/macros/rules.test.ts` |

## Deploy

Sempre informe `--project-ref` para não publicar em outro projeto vinculado à sua CLI. Se a sua CLI estiver logada em outra conta, use um token da conta do projeto só no comando (gere em *Account → Access Tokens*), sem trocar o login:

```bash
export SUPABASE_ACCESS_TOKEN=<token da conta do projeto>   # opcional, só neste terminal
supabase secrets set --project-ref jnmxrxuuzjtnoyoohhae MACROS_WEBHOOK_SECRET=<valor aleatório> GEMINI_API_KEY=<chave do Google AI Studio>
supabase functions deploy macros --project-ref jnmxrxuuzjtnoyoohhae
```

Para gerar o segredo: `python -c "import secrets; print(secrets.token_urlsafe(32))"`.

A chave do Gemini é criada em [Google AI Studio → API keys](https://aistudio.google.com/apikey). O modelo padrão é `gemini-3.5-flash-lite`; para trocar sem mexer no código, defina o secret `GEMINI_MODEL` (por exemplo `gemini-3.8-flash`).

## Webhook (uma vez, no painel do Supabase)

Em **Database → Webhooks → Create a new hook**:

1. **Table:** `products`; **Events:** `Insert` e `Update`.
2. **Type:** *Supabase Edge Functions*; **Function:** `macros`; método `POST`.
3. **HTTP Headers:** adicione `x-webhook-secret` com o mesmo valor de `MACROS_WEBHOOK_SECRET`. Mantenha também o header de autorização que o painel sugere.

A função responde `202` imediatamente; erros da IA aparecem em **Edge Functions → macros → Logs**.
