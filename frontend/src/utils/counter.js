// Filtro da tela de balcão: categoria + busca por nome, sem diferenciar acentos nem maiúsculas.
function normalize(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function filterProducts(products, category, query) {
  const term = normalize(query)
  return products.filter((product) =>
    (category === 'todos' || product.category === category) &&
    (!term || normalize(product.name).includes(term)))
}
