import { test, expect } from '@playwright/test'
import { incrementProductStockForLines } from '../../lib/inventory-increment-stock'
import { E2E_STORE_ID, getSupabaseAdmin } from './helpers'

test.describe('Suspeito #12 — incremento de estoque', () => {
  test('dois incrementos concorrentes: stock reflecte ambas as quantidades', async () => {
    const sb = getSupabaseAdmin()

    const { data: product } = await sb
      .from('products')
      .select('id')
      .eq('store_id', E2E_STORE_ID)
      .eq('active', true)
      .limit(1)
      .maybeSingle()

    expect(product?.id).toBeTruthy()

    const productId = String(product!.id)
    const baseQty = 10

    const { error: stockErr } = await sb.from('store_product_stock').upsert(
      {
        store_id: E2E_STORE_ID,
        product_id: productId,
        quantity: baseQty,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'store_id,product_id' }
    )
    expect(stockErr).toBeNull()

    const [inc1, inc2] = await Promise.all([
      incrementProductStockForLines(sb, E2E_STORE_ID, [
        { product_id: productId, quantity: 2 },
      ]),
      incrementProductStockForLines(sb, E2E_STORE_ID, [
        { product_id: productId, quantity: 3 },
      ]),
    ])

    expect(inc1).toEqual({ ok: true })
    expect(inc2).toEqual({ ok: true })

    const { data: row } = await sb
      .from('store_product_stock')
      .select('quantity')
      .eq('store_id', E2E_STORE_ID)
      .eq('product_id', productId)
      .single()

    expect(Number(row?.quantity ?? 0)).toBe(baseQty + 2 + 3)
  })
})
