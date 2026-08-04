import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { isReservedStoreSlug } from '@/lib/app-reserved-routes'
import { numberedSlug, slugifyStoreSlug } from '@/lib/store-slug'

type StoreSlugRow = {
  id: string
  slug: string | null
}

type StoreSlugSeedRow = {
  id: string
  name: string | null
  slug: string | null
}

function normalizeTaken(rows: StoreSlugRow[], excludeStoreId?: string): Set<string> {
  const taken = new Set<string>()
  for (const row of rows) {
    if (excludeStoreId && row.id === excludeStoreId) continue
    const s = typeof row.slug === 'string' ? row.slug.trim().toLowerCase() : ''
    if (s) taken.add(s)
  }
  return taken
}

// Evita colisão com outra loja; em produção use índice único em lower(btrim(slug)).
export async function resolveUniqueStoreSlug(
  supabase: SupabaseClient,
  preferredSlug: string,
  excludeStoreId?: string
): Promise<string> {
  const base = slugifyStoreSlug(preferredSlug)
  const { data, error } = await supabase.from('stores').select('id, slug')
  if (error) throw new Error(error.message || 'Falha ao consultar slugs existentes.')

  const taken = normalizeTaken((data as StoreSlugRow[] | null) ?? [], excludeStoreId)
  let i = 1
  while (i < 50_000) {
    const candidate = numberedSlug(base, i)
    const key = candidate.toLowerCase()
    if (!taken.has(key) && !isReservedStoreSlug(key)) return candidate
    i += 1
  }
  throw new Error('Não foi possível gerar slug único.')
}

export function buildUniqueSlugPlanForAllStores(rows: StoreSlugSeedRow[]): Map<string, string> {
  const ordered = [...rows].sort((a, b) => a.id.localeCompare(b.id))
  const used = new Set<string>()
  const plan = new Map<string, string>()

  for (const row of ordered) {
    const base = slugifyStoreSlug(row.slug?.trim() || row.name?.trim() || 'loja')
    let i = 1
    let next = numberedSlug(base, i)
    while (used.has(next.toLowerCase()) || isReservedStoreSlug(next)) {
      i += 1
      next = numberedSlug(base, i)
    }
    used.add(next.toLowerCase())
    plan.set(row.id, next)
  }
  return plan
}
