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
  const estiloCategoria =
    estilosPorCategoria[catNorm] ||
    estilosPorCategoria[catNorm.split(/\s+/)[0] || ''] ||
    null

  const nomeLimpo = (nome || '').trim()
  const desc = (descricao || '').trim()

  // A descrição é a fonte de verdade do que aparece no prato. O estilo da
  // categoria entra só como apoio de apresentação e nunca deve contradizer
  // os ingredientes descritos.
  const linhas: string[] = [
    `Professional food photography of a dish called "${nomeLimpo}".`,
  ]

  if (desc) {
    linhas.push(
      `The dish is exactly: ${desc}.`,
      'Depict every ingredient mentioned in this description faithfully and accurately, with realistic proportions and textures. Do not add or remove ingredients.'
    )
  } else {
    linhas.push(
      `Show a realistic and appetizing version of "${nomeLimpo}" as typically served.`
    )
  }

  if (estiloCategoria) {
    linhas.push(
      `Presentation guideline (only if it does not contradict the dish above): ${estiloCategoria}.`
    )
  } else {
    linhas.push('Beautifully plated, restaurant quality presentation.')
  }

  linhas.push(
    'Clean light marble or white surface background.',
    'Soft natural lighting with subtle shadows, sharp focus, shallow depth of field.',
    'Vibrant and appetizing colors, high resolution, photorealistic.',
    'A single original composition, not a collage, no duplicated plates.',
    'No text, no labels, no watermarks, no logos, no people, no hands.',
    'Commercial food photography style for a delivery app menu.',
    'Square format 1:1.'
  )

  return linhas.join('\n').replace(/\n{3,}/g, '\n').trim()
}
