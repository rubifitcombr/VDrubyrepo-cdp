import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

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

  const exact = await supabase
    .from('stores')
    .select(columns)
    .eq('slug', seg)
    .limit(1)
    .maybeSingle()

  if (exact.error) {
    return { data: null, error: exact.error }
  }
  if (exact.data) {
    return { data: exact.data, error: null }
  }

  const lower = seg.toLowerCase()
  if (lower !== seg) {
    const byLower = await supabase
      .from('stores')
      .select(columns)
      .eq('slug', lower)
      .limit(1)
      .maybeSingle()
    if (byLower.error) {
      return { data: null, error: byLower.error }
    }
    if (byLower.data) {
      return { data: byLower.data, error: null }
    }
  }

  const insensitive = await supabase
    .from('stores')
    .select(columns)
    .ilike('slug', escapeIlikeExactPattern(seg))
    .limit(1)
    .maybeSingle()

  if (insensitive.error) {
    return { data: null, error: insensitive.error }
  }
  return { data: insensitive.data ?? null, error: null }
}
