# Edge Function `macros`: tabela nutricional automática

Quando um produto é cadastrado ou tem nome/descrição alterados, o Supabase chama a Edge Function `macros`, que estima a tabela nutricional média com o Gemini e grava nas colunas de `products` com `nutrition_source = 'ai'`. A API Flask não participa: o produto é salvo na hora e os macros aparecem alguns segundos depois.

```
Flask grava em products ──► Database Webhook (INSERT/UPDATE)
                                     │
                                     ▼
                      Edge Function macros ──► Gemini
                                     │
              UPDATE products SET serving_size_g, ..., nutrition_source = 'ai'
```

## Regras

- **Tabela manual nunca é sobrescrita.** Se `nutrition_source = 'manual'`, a função não faz nada.
- **Sem loop.** A gravação da própria função não muda nome nem descrição, então o webhook seguinte é ignorado. Mudanças só de preço ou categoria também não chamam a IA.
- **Produto sem tabela tenta de novo** em qualquer edição (por exemplo, se a IA falhou da primeira vez).
- **Validação em duas camadas:** a função confere a resposta da IA (`rules.ts`) e o banco recusa valores inválidos pelas `CHECK constraints` da migração `a3c51e7d9b20`.

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
