// Prepara a foto do produto no navegador antes do upload: o plano gratuito do
// Supabase não redimensiona imagens, e fotos de celular passam fácil de 5 MB.

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_DIMENSION = 1200

// Mantém a proporção e só reduz (nunca amplia).
export function fitWithin(width, height, max = MAX_DIMENSION) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export function imageTypeError(file) {
  if (!file) return 'Selecione uma foto.'
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'Use uma foto JPEG, PNG ou WebP.'
  return ''
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

// File -> Blob WebP de até 1200px (ou JPEG, se o navegador não gerar WebP).
export async function prepareImage(file) {
  const error = imageTypeError(file)
  if (error) throw new Error(error)

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Não foi possível ler esta foto. Tente outro arquivo.')
  })
  const { width, height } = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  for (const quality of [0.85, 0.7, 0.55]) {
    let blob = await canvasToBlob(canvas, 'image/webp', quality)
    if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (blob && blob.size <= MAX_IMAGE_BYTES) {
      const extension = blob.type === 'image/webp' ? 'webp' : 'jpg'
      return { blob, filename: `foto.${extension}` }
    }
  }
  throw new Error('A foto continua maior que 2 MB mesmo reduzida. Tente outra imagem.')
}
