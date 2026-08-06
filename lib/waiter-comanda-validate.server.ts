import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { comandaNamesConflict } from '@/lib/waiter-comanda-names'
import {
  parseSectorFromNotes,
  parseTableFromNotes,
  tableNamesMatch,
} from '@/lib/waiter-order-notes'

const OPEN_STATUSES = ['pending', 'preparing', 'ready', 'confirmed'] as const

export async function assertUniqueComandaNameOnTable(
  db: SupabaseClient,
  storeId: string,
  table: string,
  sector: string,
  customerName: string | null | undefined,
  excludeOrderId?: string | null
): Promise<{ ok: true } | { error: string }> {
  const label = String(customerName ?? '').trim()
  if (!label) return { ok: true }

  const { data: rows, error } = await db
    .from('orders')
    .select('id, customer_name, notes, salon_table_sector, source, status')
    .eq('store_id', storeId)
    .in('source', ['waiter', 'autoatendimento'])
    .in('status', [...OPEN_STATUSES])

  if (error) {
    return { error: error.message ?? 'Erro ao validar nome da comanda.' }
  }

  const onTable = (rows ?? []).filter((row) => {
    const notes = (row as { notes?: string | null }).notes
    const tableLabel = parseTableFromNotes(notes)
    const rowSector = parseSectorFromNotes(notes)
    if (!tableLabel) return false
    return (
      tableNamesMatch(tableLabel, table) &&
      rowSector.trim().toLowerCase() === sector.trim().toLowerCase()
    )
  })

  if (
    comandaNamesConflict(
      onTable as { id: string; customer_name?: string | null }[],
      label,
      excludeOrderId
    )
  ) {
    return {
      error: 'Já existe uma comanda com este nome nesta mesa. Escolha outro nome.',
    }
  }

  return { ok: true }
}
