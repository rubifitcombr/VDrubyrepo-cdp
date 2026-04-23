const NON_ALNUM_HYPHEN = /[^a-z0-9-]/g
const MULTI_HYPHEN = /-+/g
const EDGE_HYPHEN = /^-+|-+$/g

/**
 * Slug canônico para URLs públicas da loja.
 * - remove acentos
 * - mantém apenas [a-z0-9-]
 * - colapsa hífens repetidos
 */
export function slugifyStoreSlug(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(NON_ALNUM_HYPHEN, '')
    .replace(MULTI_HYPHEN, '-')
    .replace(EDGE_HYPHEN, '')

  return normalized || 'loja'
}

/**
 * Duplicados recebem prefixo numérico: 2-minha-loja, 3-minha-loja...
 */
export function numberedSlug(baseSlug: string, index: number): string {
  const base = slugifyStoreSlug(baseSlug)
  if (index <= 1) return base
  return `${index}-${base}`
}
