import 'server-only'

import type { StorePromotionRow } from '@/lib/store-promotion'
import { createClient } from '@/lib/supabase/server'

function isPromotionsSchemaError(message: string): boolean {
  return /relation|does not exist|schema cache|42P01|store_promotions\.name|column.*name/i.test(
    message
  )
}

export type StorePromotionsPageData = {
  promotions: StorePromotionRow[]
  missingTable: boolean
}

export async function getStorePromotionsPageData(
  storeId: string
): Promise<StorePromotionsPageData> {
  const promotions = await getStorePromotions(storeId)
  if (promotions.length > 0) {
    return { promotions, missingTable: false }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('store_promotions')
    .select('id, store_id, name, active, created_at')
    .eq('store_id', storeId)
    .limit(1)

  if (error && isPromotionsSchemaError(error.message ?? '')) {
    return { promotions: [], missingTable: true }
  }
  return { promotions, missingTable: false }
}

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
    if (isPromotionsSchemaError(error.message ?? '')) {
      return []
    }
    console.error('[promotions]', error.message)
    return []
  }
  return (data as StorePromotionRow[]) ?? []
}
