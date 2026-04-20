/** Prompt para geração de imagem de produto (cardápio / delivery). */

function normalizeCategoryToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, '')
}

export function gerarPromptImagem(
  nome: string,
  descricao: string,
  categoria: string
): string {
  const estilosPorCategoria: Record<string, string> = {
    lanches:
      'served on a wooden board or slate plate, melted cheese visible, sesame bun',
    pizzas:
      'overhead shot on a round wooden board, steam rising, cheese pull visible',
    bebidas:
      'glass with condensation, ice cubes, garnish on rim, 45-degree side angle',
    sobremesas:
      'elegant plating, chocolate drizzle or fruit garnish, pastel background',
    acompanhamentos:
      'small bowl or ramekin, golden and crispy texture, close-up shot',
    acai: 'overhead shot, colorful toppings arranged beautifully, white bowl',
    marmita:
      'open container showing colorful food portions, top view, clean surface',
    saudavel:
      'fresh ingredients visible, bright colors, clean white bowl, top view',
  }

  const catNorm = normalizeCategoryToken(categoria || '')
  let estilo =
    estilosPorCategoria[catNorm] ||
    estilosPorCategoria[catNorm.split(/\s+/)[0] || ''] ||
    null
  if (!estilo) {
    estilo = 'beautifully plated, restaurant quality presentation'
  }

  const desc = (descricao || '').trim()

  return `Professional food photography of "${nome}". ${desc ? `${desc}.` : ''}
${estilo}.
Clean light marble or white surface background.
Soft natural lighting with subtle shadows, sharp focus.
Vibrant and appetizing colors, high resolution.
No text, no watermarks, no people, no hands.
Commercial food photography style for a delivery app menu.
Square format 1:1.`
    .replace(/\n{3,}/g, '\n')
    .trim()
}
