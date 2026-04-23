import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { slugifyStoreSlug } from '@/lib/store-slug'

/** Garante que `%`, `_` e `\` em slugs são literais num `ILIKE`. */
function escapeIlikeExactPattern(segment: string): string {
  return segment
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

/**
 * Resolve loja pelo segmento de URL /[slug]: primeiro igualdade exata, depois ILIKE (mesmo texto, qualquer capitalização).
 */
/** Normaliza o segmento de URL antes de procurar a loja (mobile / partilhas). */
export function normalizePublicSlugSegment(raw: string): string {
  let s = raw.trim()
  try {
    s = decodeURIComponent(s)
  } catch {
    /* ignora */
  }
  return s.normalize('NFC').trim()
}

export async function fetchStoreByPublicSlug(
  supabase: SupabaseClient,
  slugFromPath: string,
  columns: string
): Promise<{ data: unknown; error: unknown }> {
  const seg = normalizePublicSlugSegment(slugFromPath)
  if (!seg) {
    return { data: null, error: null }
  }

  const candidates = Array.from(
    new Set([seg, seg.toLowerCase(), slugifyStoreSlug(seg)])
  ).filter(Boolean)

  for (const candidate of candidates) {
    const exact = await supabase
      .from('stores')
      .select(columns)
      .eq('slug', candidate)
      .limit(1)
      .maybeSingle()
    if (exact.error) {
      return { data: null, error: exact.error }
    }
    if (exact.data) {
      return { data: exact.data, error: null }
    }
  }

  for (const candidate of candidates) {
    const insensitive = await supabase
      .from('stores')
      .select(columns)
      .ilike('slug', escapeIlikeExactPattern(candidate))
      .limit(1)
      .maybeSingle()

    if (insensitive.error) {
      return { data: null, error: insensitive.error }
    }
    if (insensitive.data) {
      return { data: insensitive.data, error: null }
    }
  }

  /**
   * Fallback legado: slugs antigas com acentos/caracteres especiais.
   * Compara versões slugificadas em memória para evitar 404 em links antigos.
   */
  const legacyPool = await supabase
    .from('stores')
    .select('id, slug')
    .limit(5000)
  if (legacyPool.error) {
    return { data: null, error: legacyPool.error }
  }

  const wanted = slugifyStoreSlug(seg)
  const rows = (legacyPool.data as Array<{ id: string; slug: string | null }> | null) ?? []
  const matched = rows.find((row) => slugifyStoreSlug(row.slug?.trim() || '') === wanted)
  if (!matched?.id) {
    return { data: null, error: null }
  }

  const byId = await supabase
    .from('stores')
    .select(columns)
    .eq('id', matched.id)
    .limit(1)
    .maybeSingle()
  if (byId.error) {
    return { data: null, error: byId.error }
  }
  return { data: byId.data ?? null, error: null }
}
