/**
 * Segmentos iniciais reservados pela app (não são slugs de loja em /[slug]).
 * Usado para normalizar maiúsculas na URL e evitar 404 por confusão com o cardápio público.
 */
export const APP_RESERVED_FIRST_SEGMENTS = new Set([
  'admin',
  'api',
  'blog',
  'dashboard',
  'login',
  'register',
  'acesso-suspenso',
  'planos',
  'termos',
  'icons',
  'manifest.json',
  'sw.js',
  'favicon.ico',
])

/** True se o segmento (já slugificado) não pode ser slug de loja. */
export function isReservedStoreSlug(slug: string): boolean {
  const s = String(slug ?? '')
    .trim()
    .toLowerCase()
  if (!s) return true
  return APP_RESERVED_FIRST_SEGMENTS.has(s)
}
