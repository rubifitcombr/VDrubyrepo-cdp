import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_INCREMENT_ATTEMPTS = 8

/** Devolve stock (incremento atómico com verificação de linhas afectadas). */
export async function incrementProductStockForLines(
  db: SupabaseClient,
  storeId: string,
  lines: Array<{ product_id: string; quantity: number }>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const totals = new Map<string, number>()
  for (const line of lines) {
    const pid = String(line.product_id ?? '').trim()
    if (!pid) continue
    const qty = Math.max(0, Number(line.quantity) || 0)
    if (qty <= 0) continue
    totals.set(pid, (totals.get(pid) ?? 0) + qty)
  }

  const now = new Date().toISOString()
  for (const [productId, qty] of totals) {
    let applied = false

    for (let attempt = 0; attempt < MAX_INCREMENT_ATTEMPTS; attempt++) {
      const { data: row, error: readErr } = await db
        .from('store_product_stock')
        .select('quantity')
        .eq('store_id', storeId)
        .eq('product_id', productId)
        .maybeSingle()

      if (readErr) {
        return { ok: false, error: readErr.message || 'Erro ao ler estoque.' }
      }
      if (!row) {
        applied = true
        break
      }

      const current = Math.max(0, Number(row.quantity) || 0)
      const { data: updated, error: upErr } = await db
        .from('store_product_stock')
        .update({
          quantity: current + qty,
          updated_at: now,
        })
        .eq('store_id', storeId)
        .eq('product_id', productId)
        .eq('quantity', current)
        .select('quantity')
        .maybeSingle()

      if (upErr) {
        return { ok: false, error: upErr.message || 'Erro ao actualizar estoque.' }
      }
      if (updated) {
        applied = true
        break
      }
    }

    if (!applied) {
      return {
        ok: false,
        error: 'Conflito ao actualizar estoque. Tenta novamente.',
      }
    }
  }

  return { ok: true }
}
