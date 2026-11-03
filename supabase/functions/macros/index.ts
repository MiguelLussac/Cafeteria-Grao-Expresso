// Edge Function "macros": chamada pelo Database Webhook de INSERT/UPDATE em
// public.products, estima a tabela nutricional com IA e grava com origem "ai".
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { estimateNutrition } from './estimate.ts'
import { decide, type ProductRow, type WebhookPayload, validateNutrition } from './rules.ts'

const PRODUCT_COLUMNS = 'id, name, description, category, nutrition_source, nutrition_status'

// Background tasks do Supabase: mantém a função viva após a resposta.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  // A chave anon é pública e também passa pela verificação de JWT do Supabase;
  // o segredo do webhook garante que só o banco dispara chamadas (que custam) à IA.
  const secret = Deno.env.get('MACROS_WEBHOOK_SECRET')
  if (!secret) return json({ error: 'MACROS_WEBHOOK_SECRET não configurado' }, 500)
  if (req.headers.get('x-webhook-secret') !== secret) return json({ error: 'não autorizado' }, 401)

  let payload: WebhookPayload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'corpo inválido' }, 400)
  }

  const decision = decide(payload)
  if (!decision.estimate) return json({ skipped: decision.reason })

  // O webhook tem timeout curto e a IA leva segundos: responde já e segue em
  // segundo plano. O resultado aparece nos logs da função no painel.
  const productId = payload.record!.id
  EdgeRuntime.waitUntil(fillNutrition(productId).catch((err) => {
    console.error(`macros: falha no produto ${productId}`, err)
  }))
  return json({ accepted: productId, reason: decision.reason }, 202)
})

async function fillNutrition(productId: number): Promise<void> {
  // Variáveis injetadas automaticamente pelo Supabase em toda Edge Function.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Relê o produto: o payload pode estar desatualizado se houve outra edição.
  const { data: product, error: readError } = await supabase
    .from('products').select(PRODUCT_COLUMNS).eq('id', productId).maybeSingle<ProductRow>()
  if (readError) throw readError
  if (!product || product.nutrition_source === 'manual' || product.nutrition_status !== 'pending') return

  // Só grava se o produto ainda espera a estimativa: não sobrescreve uma
  // edição manual feita enquanto a IA respondia.
  const writeIfPending = async (fields: Record<string, unknown>) => {
    const { error } = await supabase.from('products').update(fields)
      .eq('id', product.id).eq('nutrition_status', 'pending').is('nutrition_source', null)
    if (error) throw error
  }

  try {
    const result = validateNutrition(await estimateNutrition(product))
    if ('error' in result) throw new Error(`resposta da IA inválida: ${result.error}`)
    await writeIfPending({ ...result.nutrition, nutrition_source: 'ai', nutrition_status: 'ready' })
    console.log(`macros: produto ${product.id} atualizado`, result.nutrition)
  } catch (err) {
    console.error(`macros: falha ao estimar o produto ${product.id}`, err)
    // "failed" aparece como "Indisponível" e libera o botão "Tentar de novo" no admin.
    await writeIfPending({ nutrition_status: 'failed' })
  }
}
