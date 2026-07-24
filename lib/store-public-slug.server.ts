import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { slugifyStoreSlug } from '@/lib/store-slug'
import { readStoreStatus } from '@/lib/store-columns'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import { withTimeout } from '@/lib/supabase/fetch-with-timeout'
import { createPublicAnonClient } from '@/lib/supabase/public.server'
import { SUPABASE_SERVER_FETCH_TIMEOUT_MS } from '@/lib/supabase/client-options'

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

function isStorePublicActiveRow(row: Record<string, unknown>): boolean {
  const status = String(readStoreStatus(row) ?? '')
    .trim()
    .toLowerCase()
  return status === 'ativo'
}

async function timed<T>(
  label: string,
  promise: Promise<T>
): Promise<T> {
  return withTimeout(promise, SUPABASE_SERVER_FETCH_TIMEOUT_MS, label)
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

  if (opts?.allowDirectTable) {
    return fetchStoreDirectTable(supabase, seg, columns)
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

  return fetchStoreDirectTable(supabase, seg, columns)
}

function projectStoreColumns(
  row: Record<string, unknown>,
  columns: string
): Record<string, unknown> {
  const trimmed = columns.trim()
  if (!trimmed || trimmed === '*') return row
  return pickPublicStoreFields(row, columns)
}

async function fetchStoreDirectTable(
  supabase: SupabaseClient,
  seg: string,
  columns: string
): Promise<{ data: unknown; error: unknown }> {
  const candidates = Array.from(
    new Set([seg, seg.toLowerCase(), slugifyStoreSlug(seg)])
  ).filter(Boolean)

  for (const candidate of candidates) {
    const exact = await supabase
      .from('stores')
      .select('*')
      .eq('slug', candidate)
      .limit(1)
      .maybeSingle()
    if (exact.error) {
      return { data: null, error: exact.error }
    }
    if (exact.data) {
      const row = exact.data as unknown as Record<string, unknown>
      if (!isStorePublicActiveRow(row)) {
        return { data: null, error: null }
      }
      return { data: projectStoreColumns(row, columns), error: null }
    }
  }

  for (const candidate of candidates) {
    const insensitive = await supabase
      .from('stores')
      .select('*')
      .ilike('slug', escapeIlikeExactPattern(candidate))
      .limit(1)
      .maybeSingle()

    if (insensitive.error) {
      return { data: null, error: insensitive.error }
    }
    if (insensitive.data) {
      const row = insensitive.data as unknown as Record<string, unknown>
      if (!isStorePublicActiveRow(row)) {
        return { data: null, error: null }
      }
      return { data: projectStoreColumns(row, columns), error: null }
    }
  }

  return { data: null, error: null }
}

/**
 * Leitura da loja no cardápio público (server).
 * Preferência: RPC (segura, independente de colunas opcionais); fallback service role + tabela.
 */
export async function fetchPublicStoreForSlugPage(
  slugFromPath: string,
  columns: string
): Promise<{ data: unknown; error: unknown }> {
  const anon = createPublicAnonClient()
  try {
    const rpc = await timed(
      'loja pública (rpc)',
      fetchStoreByPublicSlug(anon, slugFromPath, columns)
    )
    if (rpc.data) return rpc
    if (rpc.error) {
      console.warn('[fetchPublicStoreForSlugPage] rpc', rpc.error)
    }
  } catch (e) {
    console.error('[fetchPublicStoreForSlugPage] rpc timeout', e)
  }

  const svc = tryCreateServiceRoleClient()
  if (svc) {
    try {
      const direct = await timed(
        'loja pública (service role)',
        fetchStoreByPublicSlug(svc, slugFromPath, columns, {
          allowDirectTable: true,
        })
      )
      if (direct.data) return direct
      if (direct.error) {
        console.error('[fetchPublicStoreForSlugPage] direct', direct.error)
      }
    } catch (e) {
      console.error('[fetchPublicStoreForSlugPage] direct timeout', e)
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
