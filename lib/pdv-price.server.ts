import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  effectiveProductPrice,
  type ProductPriceChannel,
} from '@/lib/product-pricing'
import {
  MENU_PRODUCT_SELECT,
  normalizeMenuProductRow,
  type MenuProductRow,
} from '@/lib/menu-product'
import { roundWeightKg } from '@/lib/scale/price'
import type { OrderItemUnitType } from '@/lib/scale/types'
import {
  effectivePricePerKg,
  isSoldByWeight,
  validateWeighableLineWeight,
} from '@/lib/weighable-product'
import {
  addonTotalFromCatalog,
  loadAddonCatalogForProducts,
  loadAddonGroupRulesForProducts,
  parseCheckoutAddons,
  validateRequiredAddonPicks,
  type CheckoutAddonPick,
} from '@/lib/public-checkout-pricing.server'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type PdvPricedLine = {
  product_id: string
  quantity: number
  unit_price: number
  name: string
  unit_type: OrderItemUnitType
  weight_kg?: number | null
  price_per_kg?: number | null
  addons?: CheckoutAddonPick[]
}

type AddonCatalogItem = {
  groupName: string
  itemName: string
  price: number
}

/** Limite superior razoável de extras por produto (soma máx. por grupo). */
function maxAddonExtraFromCatalog(catalog: AddonCatalogItem[]): number {
  const byGroup = new Map<string, number>()
  for (const c of catalog) {
    const prev = byGroup.get(c.groupName) ?? 0
    byGroup.set(c.groupName, prev + Math.max(0, c.price))
  }
  let sum = 0
  for (const v of byGroup.values()) sum += v
  return round2(sum)
}

function resolveUnitPriceWithAddons(input: {
  row: MenuProductRow
  channel: ProductPriceChannel
  clientUnit: number
  clientName: string
  addonPicks: CheckoutAddonPick[]
  catalog: AddonCatalogItem[]
}): { ok: true; unitPrice: number; name: string } | { ok: false; error: string } {
  const baseUnit = round2(effectiveProductPrice(input.row, input.channel))
  const productLabel = input.row.name?.trim() || 'produto'

  if (input.addonPicks.length > 0) {
    const addonSum = addonTotalFromCatalog(input.catalog, input.addonPicks)
    if (!Number.isFinite(addonSum)) {
      return {
        ok: false,
        error: `Um adicional de «${productLabel}» não está mais disponível. Actualiza o pedido e tenta de novo.`,
      }
    }
    const serverUnit = round2(baseUnit + addonSum)
    if (Math.abs(input.clientUnit - serverUnit) > 0.02) {
      return {
        ok: false,
        error: `O preço de «${productLabel}» mudou. Actualiza o pedido e tenta de novo.`,
      }
    }
    return {
      ok: true,
      unitPrice: serverUnit,
      name: input.clientName.trim() || productLabel,
    }
  }

  if (Math.abs(input.clientUnit - baseUnit) <= 0.02) {
    return {
      ok: true,
      unitPrice: baseUnit,
      name: input.row.name?.trim() || input.clientName.trim() || 'Item',
    }
  }

  if (input.clientUnit > baseUnit + 0.02) {
    const maxExtra = maxAddonExtraFromCatalog(input.catalog)
    if (input.clientUnit > baseUnit + maxExtra + 0.02) {
      return {
        ok: false,
        error: `O preço de «${productLabel}» mudou. Actualiza o pedido e tenta de novo.`,
      }
    }
    return {
      ok: true,
      unitPrice: round2(input.clientUnit),
      name: input.clientName.trim() || productLabel,
    }
  }

  return {
    ok: false,
    error: `O preço de «${productLabel}» mudou. Actualiza o pedido e tenta de novo.`,
  }
}

/**
 * Recalcula preços PDV/garçom no servidor — valida base + adicionais quando enviados.
 */
export async function pricePdvLinesFromCatalog(
  supabase: SupabaseClient,
  storeId: string,
  items: Array<{
    product_id?: unknown
    quantity?: unknown
    unit_price?: unknown
    name?: unknown
    unit_type?: unknown
    addons?: unknown
  }>,
  channel: ProductPriceChannel = 'base'
): Promise<
  | { ok: true; lines: PdvPricedLine[] }
  | { ok: false; error: string; status: number }
> {
  const productIds = items
    .map((i) => String(i.product_id ?? '').trim())
    .filter(Boolean)

  if (productIds.length === 0) {
    return { ok: false, error: 'Cada item precisa de product_id válido.', status: 400 }
  }

  const { data: productRows, error: prodErr } = await supabase
    .from('products')
    .select(MENU_PRODUCT_SELECT)
    .eq('store_id', storeId)
    .eq('active', true)
    .in('id', productIds)

  if (prodErr) {
    return {
      ok: false,
      error: 'Não foi possível validar os produtos.',
      status: 500,
    }
  }

  const byId = new Map<string, MenuProductRow>()
  for (const raw of productRows ?? []) {
    const row = normalizeMenuProductRow(raw as Record<string, unknown>, storeId)
    if (row.id) byId.set(row.id, row)
  }

  const addonCatalog = await loadAddonCatalogForProducts(supabase, productIds)
  const addonGroupRules = await loadAddonGroupRulesForProducts(supabase, productIds)

  const lines: PdvPricedLine[] = []

  for (const item of items) {
    const productId = String(item.product_id ?? '').trim()
    if (!productId) continue
    const row = byId.get(productId)
    if (!row) continue

    if (isSoldByWeight(row)) {
      const pricePerKg = effectivePricePerKg(row)
      if (pricePerKg == null || pricePerKg <= 0) {
        return {
          ok: false,
          error: `«${row.name || 'produto'}» não tem preço por kg configurado.`,
          status: 400,
        }
      }

      const weightKg = roundWeightKg(Number(item.quantity) || 0)
      const weightCheck = validateWeighableLineWeight(row, weightKg)
      if (!weightCheck.ok) {
        return { ok: false, error: weightCheck.error, status: 400 }
      }

      const clientUnit = round2(Math.max(0, Number(item.unit_price) || 0))
      if (Math.abs(clientUnit - pricePerKg) > 0.02) {
        return {
          ok: false,
          error: `O preço/kg de «${row.name || 'produto'}» mudou. Actualiza o pedido e tenta de novo.`,
          status: 409,
        }
      }

      lines.push({
        product_id: productId,
        quantity: weightKg,
        unit_price: pricePerKg,
        name: row.name?.trim() || String(item.name ?? '').trim() || 'Item',
        unit_type: 'weight',
        weight_kg: weightKg,
        price_per_kg: pricePerKg,
      })
      continue
    }

    const clientUnit = round2(Math.max(0, Number(item.unit_price) || 0))
    const addonPicks = parseCheckoutAddons(item.addons)
    const productLabel = row.name?.trim() || 'produto'
    const rules = addonGroupRules.get(productId) ?? []
    if (!validateRequiredAddonPicks(rules, addonPicks)) {
      return {
        ok: false,
        error: `Seleciona os adicionais obrigatórios de «${productLabel}».`,
        status: 400,
      }
    }
    const priced = resolveUnitPriceWithAddons({
      row,
      channel,
      clientUnit,
      clientName: String(item.name ?? ''),
      addonPicks,
      catalog: addonCatalog.get(productId) ?? [],
    })

    if (!priced.ok) {
      return { ok: false, error: priced.error, status: 409 }
    }

    lines.push({
      product_id: productId,
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      unit_price: priced.unitPrice,
      name: priced.name,
      unit_type: 'unit',
      ...(addonPicks.length > 0 ? { addons: addonPicks } : {}),
    })
  }

  if (lines.length === 0) {
    return {
      ok: false,
      error: 'Nenhum item válido para esta loja.',
      status: 400,
    }
  }

  return { ok: true, lines }
}

/** Mapeia linhas precificadas para insert em `order_items`. */
export function mapPricedLinesToOrderItemRows(
  orderId: string,
  lines: PdvPricedLine[]
): Array<Record<string, unknown>> {
  return lines.map((l) => {
    const isWeight = l.unit_type === 'weight'
    const lineTotal = round2(l.unit_price * l.quantity)
    return {
      order_id: orderId,
      product_id: l.product_id,
      quantity: l.quantity,
      price: lineTotal,
      unit_price: l.unit_price,
      name: l.name,
      unit_type: l.unit_type,
      weight_kg: isWeight ? l.quantity : null,
      price_per_kg_snapshot: isWeight ? l.unit_price : null,
      addons: l.addons && l.addons.length > 0 ? l.addons : null,
    }
  })
}
