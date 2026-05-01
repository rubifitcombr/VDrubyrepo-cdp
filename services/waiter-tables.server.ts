import 'server-only'

import { createClient } from '@/lib/supabase/server'

export type StoreTableRow = {
  id: string
  store_id: string
  name: string
  ambiente: string
  active: boolean
  sort_order: number
}

function mapRow(row: Record<string, unknown>): StoreTableRow {
  return {
    id: String(row.id ?? ''),
    store_id: String(row.store_id ?? ''),
    name: String(row.name ?? '').trim() || '—',
    ambiente: String(row.ambiente ?? 'Salão').trim() || 'Salão',
    active: row.active !== false,
    sort_order: Math.round(Number(row.sort_order) || 0),
  }
}

export async function getStoreTablesForStore(storeId: string): Promise<StoreTableRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('store_tables')
    .select('id, store_id, name, ambiente, active, sort_order')
    .eq('store_id', storeId)
    .eq('active', true)
    .order('ambiente', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    if (/does not exist|relation|schema cache/i.test(error.message)) return []
    console.error('[waiter-tables] list:', error.message)
    return []
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}
