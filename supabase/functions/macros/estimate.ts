// Chamada ao Gemini (Interactions API do SDK @google/genai). Único arquivo que
// muda ao trocar de provedor: devolve o JSON bruto; a validação fica em rules.ts.
import { GoogleGenAI } from 'npm:@google/genai@2.29.1'
import { NUTRITION_KEYS, type ProductRow } from './rules.ts'

// Modelo estável mais econômico para texto; troque com o secret GEMINI_MODEL.
const DEFAULT_MODEL = 'gemini-3.5-flash-lite'

export const SYSTEM_PROMPT = `Você é um nutricionista que estima a tabela nutricional média de itens de cafeteria brasileira.
Responda somente com os valores de UMA porção típica servida ao cliente, em gramas e kcal:
serving_size_g, calories_kcal, protein_g, carbs_g, fat_g.
Use referências como a Tabela TACO quando houver item equivalente. Proteínas + carboidratos + gorduras
não podem passar do peso da porção.`

const NUTRITION_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(NUTRITION_KEYS.map((key) => [key, { type: 'number', minimum: 0 }])),
  required: [...NUTRITION_KEYS],
}

export function buildUserPrompt(product: Pick<ProductRow, 'name' | 'description' | 'category'>): string {
  return [
    `Produto: ${product.name}`,
    `Categoria: ${product.category}`,
    `Descrição: ${product.description?.trim() || '(sem descrição)'}`,
  ].join('\n')
}

export async function estimateNutrition(
  product: Pick<ProductRow, 'name' | 'description' | 'category'>,
): Promise<unknown> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada nos secrets da função.')

  const ai = new GoogleGenAI({ apiKey })
  const interaction = await ai.interactions.create({
    model: Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL,
    system_instruction: SYSTEM_PROMPT,
    input: buildUserPrompt(product),
    response_format: { type: 'text', mime_type: 'application/json', schema: NUTRITION_SCHEMA },
    generation_config: { thinking_level: 'low', max_output_tokens: 1024 },
    store: false,
  })

  if (interaction.status && interaction.status !== 'completed') {
    throw new Error(`Gemini terminou com status "${interaction.status}".`)
  }
  if (!interaction.output_text) throw new Error('Gemini não devolveu texto.')
  return JSON.parse(interaction.output_text)
}
