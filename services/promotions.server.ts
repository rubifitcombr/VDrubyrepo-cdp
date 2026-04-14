import 'server-only'

import type { StorePromotionRow } from '@/lib/store-promotion'
import { createClient } from '@/lib/supabase/server'

export async function getStorePromotions(
  storeId: string
): Promise<StorePromotionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('store_promotions')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) {
    if (
      error.message?.includes('does not exist') ||
      error.message?.includes('schema cache') ||
      error.code === '42P01'
    ) {
      return []
    }
    console.error('[promotions]', error.message)
    return []
  }
  return (data as StorePromotionRow[]) ?? []
}
