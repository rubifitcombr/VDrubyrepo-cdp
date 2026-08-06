import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSalonTableForStore } from '@/lib/salon-table-resolve.server'
import {
  isSalonMapOrderSource,
  parseSectorFromNotes,
  parseTableFromOrder,
} from '@/lib/waiter-order-notes'

export type SalonTableBackfillResult = {
  scanned: number
  updated: number
  skipped: number
  ambiguous: number
  unresolved: number
}

/** Preenche `salon_table_id` em pedidos históricos a partir das notas `[Mesa …]` / `[Setor …]`. */
export async function backfillSalonTableIdsForStore(
  db: SupabaseClient,
  storeId: string,
  opts?: { dryRun?: boolean; limit?: number }
): Promise<SalonTableBackfillResult> {
  const dryRun = opts?.dryRun ?? false
  const limit = opts?.limit ?? 5000

  const { data: rows, error } = await db
    .from('orders')
    .select('id, notes, delivery_address, source, salon_table_id')
    .eq('store_id', storeId)
    .is('salon_table_id', null)
    .in('source', ['waiter', 'autoatendimento'])
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)

  const result: SalonTableBackfillResult = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    ambiguous: 0,
    unresolved: 0,
  }

  for (const row of rows ?? []) {
    result.scanned += 1
    const source = String((row as { source?: string }).source ?? '')
    if (!isSalonMapOrderSource(source)) {
      result.skipped += 1
      continue
    }

    const tableLabel = parseTableFromOrder({
      notes: (row as { notes?: string | null }).notes,
      delivery_address: (row as { delivery_address?: string | null }).delivery_address,
    })
    if (!tableLabel) {
      result.unresolved += 1
      continue
    }

    const sector = parseSectorFromNotes((row as { notes?: string | null }).notes)
    const resolved = await resolveSalonTableForStore(db, storeId, tableLabel, sector)
    if (resolved.ambiguous) {
      result.ambiguous += 1
      continue
    }
    if (!resolved.tableId) {
      result.unresolved += 1
      continue
    }

    if (!dryRun) {
      const { error: upErr } = await db
        .from('orders')
        .update({
          salon_table_id: resolved.tableId,
          salon_table_sector: resolved.sector,
        })
        .eq('id', (row as { id: string }).id)
        .is('salon_table_id', null)
      if (upErr) {
        result.unresolved += 1
        continue
      }
    }
    result.updated += 1
  }

  return result
}
