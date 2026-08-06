import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { tableNamesMatch } from '@/lib/waiter-order-notes'

export type ResolvedSalonTable = {
  tableId: string | null
  sector: string
  tableName: string
}

export async function resolveSalonTableForStore(
  db: SupabaseClient,
  storeId: string,
  tableName: string,
  sectorHint?: string | null
): Promise<ResolvedSalonTable> {
  const label = tableName.trim()
  const sector = (sectorHint?.trim() || 'Salão').slice(0, 40)
  if (!label) return { tableId: null, sector, tableName: '' }

  const { data: rows } = await db
    .from('store_tables')
    .select('id, name, ambiente, active')
    .eq('store_id', storeId)
    .eq('active', true)

  const matches = (rows ?? []).filter((row) =>
    tableNamesMatch(label, String((row as { name?: string }).name ?? ''))
  )

  if (matches.length === 1) {
    const row = matches[0] as { id: string; ambiente?: string | null; name?: string }
    return {
      tableId: String(row.id),
      sector: String(row.ambiente ?? sector).trim() || sector,
      tableName: String(row.name ?? label).trim() || label,
    }
  }

  if (matches.length > 1 && sectorHint?.trim()) {
    const bySector = matches.find(
      (row) =>
        String((row as { ambiente?: string }).ambiente ?? '')
          .trim()
          .toLowerCase() === sectorHint.trim().toLowerCase()
    )
    if (bySector) {
      const row = bySector as { id: string; ambiente?: string | null; name?: string }
      return {
        tableId: String(row.id),
        sector: String(row.ambiente ?? sector).trim() || sector,
        tableName: String(row.name ?? label).trim() || label,
      }
    }
  }

  return { tableId: null, sector, tableName: label }
}
