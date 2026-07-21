import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { slugifyStoreSlug } from '@/lib/store-slug'

function escapeIlikeExactPattern(segment: string): string {
  return segment
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

export function normalizePublicSlugSegment(raw: string): string {
  let s = raw.trim()
  try {
    s = decodeURIComponent(s)
  } catch {
    /* ignora */
  }
  return s.normalize('NFC').trim()
}

async function fetchStoreViaPublicRpc(
  supabase: SupabaseClient,
  slugFromPath: string
): Promise<{ data: unknown; error: unknown }> {
  const seg = normalizePublicSlugSegment(slugFromPath)
  if (!seg) return { data: null, error: null }

  const { data, error } = await supabase.rpc('get_public_store_by_slug', {
    p_slug: seg,
  })

  if (error) {
    return { data: null, error }
  }
  if (data && typeof data === 'object') {
    return { data, error: null }
  }

  const candidates = Array.from(
    new Set([seg, seg.toLowerCase(), slugifyStoreSlug(seg)])
  ).filter(Boolean)

  for (const candidate of candidates) {
    if (candidate === seg) continue
    const retry = await supabase.rpc('get_public_store_by_slug', {
      p_slug: candidate,
    })
    if (retry.error) return { data: null, error: retry.error }
    if (retry.data && typeof retry.data === 'object') {
      return { data: retry.data, error: null }
    }
  }

  return { data: null, error: null }
}

/**
 * Resolve loja pelo segmento de URL /[slug].
 * Preferir RPC `get_public_store_by_slug` (sem expor segredos via RLS directo).
 * Com service role (admin/server legado): fallback ILIKE na tabela stores.
 */
export async function fetchStoreByPublicSlug(
  supabase: SupabaseClient,
  slugFromPath: string,
  columns: string,
  opts?: { allowDirectTable?: boolean }
): Promise<{ data: unknown; error: unknown }> {
  const seg = normalizePublicSlugSegment(slugFromPath)
  if (!seg) {
    return { data: null, error: null }
  }

  const rpcResult = await fetchStoreViaPublicRpc(supabase, seg)
  if (rpcResult.data) {
    const row = rpcResult.data as Record<string, unknown>
    return {
      data: columns.trim() === '*' ? row : pickPublicStoreFields(row, columns),
      error: null,
    }
  }
  if (rpcResult.error && !opts?.allowDirectTable) {
    return rpcResult
  }

  if (!opts?.allowDirectTable) {
    return { data: null, error: rpcResult.error ?? null }
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

  return { data: null, error: null }
}

/**
 * Campos públicos seguros devolvidos pela RPC (subset comum).
 */
export function pickPublicStoreFields(
  row: Record<string, unknown>,
  columns: string
): Record<string, unknown> {
  const keys = columns.split(',').map((k) => k.trim()).filter(Boolean)
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    if (k in row) out[k] = row[k]
  }
  return out
}
