import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import { resolveUniqueStoreSlug } from '@/lib/store-slug.server'
import { slugifyStoreSlug } from '@/lib/store-slug'

export const getStoreByUser = cache(async function getStoreByUser(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('stores')
    .select('*')
    .eq('owner_id', userId)
    .single()

  if (!data || typeof data !== 'object') return data

  const row = data as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id : ''
  const name = typeof row.name === 'string' ? row.name : 'loja'
  const currentSlug = typeof row.slug === 'string' ? row.slug : ''
  const normalized = slugifyStoreSlug(currentSlug || name)
  if (!id || currentSlug === normalized) return data
  if (currentSlug.trim()) return data

  try {
    const svc = tryCreateServiceRoleClient()
    if (!svc) return data
    const unique = await resolveUniqueStoreSlug(svc, normalized, id)
    const { data: updated } = await svc
      .from('stores')
      .update({ slug: unique })
      .eq('id', id)
      .select('*')
      .maybeSingle()
    return updated ?? data
  } catch {
    return data
  }
})
