import { createClient } from '@/lib/supabase/client'
import type { StorePromotionRow } from '@/lib/store-promotion'

export async function getStorePromotionsClient(
  storeId: string
): Promise<StorePromotionRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('store_promotions')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[promotions]', error.message)
    return []
  }
  return (data as StorePromotionRow[]) ?? []
}

export async function createStorePromotion(payload: {
  store_id: string
  name: string
  description: string | null
  valid_until: string | null
  promotional_price: number | null
  active: boolean
}) {
  const supabase = createClient()
  return supabase.from('store_promotions').insert({
    store_id: payload.store_id,
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    valid_until: payload.valid_until?.trim() || null,
    promotional_price: payload.promotional_price,
    active: payload.active,
  })
}

export async function updateStorePromotion(
  id: string,
  patch: Partial<{
    name: string
    description: string | null
    valid_until: string | null
    promotional_price: number | null
    active: boolean
  }>
) {
  const supabase = createClient()
  const row: Record<string, unknown> = {}
  if (typeof patch.name === 'string') row.name = patch.name.trim()
  if (patch.description !== undefined)
    row.description = patch.description?.trim() || null
  if (patch.valid_until !== undefined)
    row.valid_until = patch.valid_until?.trim() || null
  if (patch.promotional_price !== undefined)
    row.promotional_price = patch.promotional_price
  if (typeof patch.active === 'boolean') row.active = patch.active
  return supabase.from('store_promotions').update(row).eq('id', id)
}

export async function deleteStorePromotion(id: string) {
  const supabase = createClient()
  return supabase.from('store_promotions').delete().eq('id', id)
}
