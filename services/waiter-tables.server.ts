import 'server-only'

import { createClient } from '@/lib/supabase/server'
import {
  STORE_TABLES_SELECT,
  mapActiveStoreTableRows,
  sortStoreTableRows,
  type StoreTableRow,
} from '@/lib/store-tables'

export type { StoreTableRow }

export async function getStoreTablesForStore(storeId: string): Promise<StoreTableRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('store_tables')
    .select(STORE_TABLES_SELECT)
    .eq('store_id', storeId)
    .order('ambiente', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    if (/does not exist|relation|schema cache/i.test(error.message)) return []
    console.error('[waiter-tables] list:', error.message)
    return []
  }
  return sortStoreTableRows(
    mapActiveStoreTableRows((data as Record<string, unknown>[] | null) ?? [])
  )
}
