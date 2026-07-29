import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MENU_PRODUCT_SELECT,
  normalizeMenuProductRow,
  type MenuProductRow,
} from '@/lib/menu-product'
import { roundWeightKg, weighableLineTotal } from '@/lib/scale/price'
import { parseEan13WeighableBarcode } from '@/lib/scale/ean13-weight'
import { pluCodesMatch } from '@/lib/scale/plu-match'
import {
  effectivePricePerKg,
  isSoldByWeight,
  validateWeighableLineWeight,
} from '@/lib/weighable-product'

export type ResolvedWeighableBarcode = {
  productId: string
  name: string
  plu: string
  weightKg: number
  pricePerKg: number
  lineTotal: number
  barcode: string
}

export type ResolveWeighableBarcodeResult =
  | { ok: true; data: ResolvedWeighableBarcode }
  | { ok: false; error: string; code: string; status: number }

export async function resolveWeighableBarcodeForStore(
  supabase: SupabaseClient,
  storeId: string,
  rawBarcode: string,
  opts: { pluPrefix?: string }
): Promise<ResolveWeighableBarcodeResult> {
  const parsed = parseEan13WeighableBarcode(rawBarcode, {
    pluPrefix: opts.pluPrefix ?? '2',
  })
  if (!parsed) {
    return {
      ok: false,
      code: 'invalid_barcode',
      error: 'Código de barras inválido ou não é etiqueta pesável EAN-13.',
      status: 400,
    }
  }

  const { data: productRows, error } = await supabase
    .from('products')
    .select(MENU_PRODUCT_SELECT)
    .eq('store_id', storeId)
    .eq('active', true)
    .eq('sold_by_weight', true)

  if (error) {
    return {
      ok: false,
      code: 'db_error',
      error: 'Não foi possível procurar o produto pelo PLU.',
      status: 500,
    }
  }

  let product: MenuProductRow | null = null
  for (const raw of productRows ?? []) {
    const row = normalizeMenuProductRow(raw as Record<string, unknown>, storeId)
    if (!isSoldByWeight(row)) continue
    if (pluCodesMatch(row.plu_code, parsed.plu)) {
      product = row
      break
    }
  }

  if (!product) {
    return {
      ok: false,
      code: 'product_not_found',
      error: `Nenhum produto pesável com PLU ${parsed.plu} nesta loja.`,
      status: 404,
    }
  }

  const pricePerKg = effectivePricePerKg(product)
  if (pricePerKg == null || pricePerKg <= 0) {
    return {
      ok: false,
      code: 'invalid_price',
      error: `«${product.name}» não tem preço por kg configurado.`,
      status: 400,
    }
  }

  const weightKg = roundWeightKg(parsed.weightKg)
  const weightCheck = validateWeighableLineWeight(product, weightKg)
  if (!weightCheck.ok) {
    return {
      ok: false,
      code: 'invalid_weight',
      error: weightCheck.error,
      status: 400,
    }
  }

  return {
    ok: true,
    data: {
      productId: product.id,
      name: product.name,
      plu: parsed.plu,
      weightKg,
      pricePerKg,
      lineTotal: weighableLineTotal(pricePerKg, weightKg),
      barcode: parsed.barcode,
    },
  }
}
