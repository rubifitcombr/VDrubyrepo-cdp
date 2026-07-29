import { roundMoneyBrl, roundWeightKg } from '@/lib/scale/price'
import type { OrderItemUnitType } from '@/lib/scale/types'

export const DEFAULT_MIN_WEIGHT_KG = 0.01
export const DEFAULT_MAX_WEIGHT_KG = 50

export const WEIGHABLE_PRODUCT_COLUMNS =
  'sold_by_weight, price_per_kg, plu_code, default_tare_kg, min_weight_kg, max_weight_kg'

export type WeighableProductFields = {
  sold_by_weight: boolean
  price_per_kg: number | null
  plu_code: string | null
  default_tare_kg: number
  min_weight_kg: number
  max_weight_kg: number
}

export type WeighableProductInput = {
  sold_by_weight?: boolean
  price_per_kg?: number | string | null
  plu_code?: string | null
  default_tare_kg?: number | string | null
  min_weight_kg?: number | string | null
  max_weight_kg?: number | string | null
}

function parseOptionalNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseWeightBound(v: unknown, fallback: number): number {
  const n = parseOptionalNum(v)
  if (n == null || n < 0) return fallback
  return roundWeightKg(n)
}

/** Normaliza PLU: só dígitos, 2–5 caracteres. */
export function normalizePluCode(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length < 2 || digits.length > 5) return null
  return digits
}

export function isSoldByWeight(row: {
  sold_by_weight?: unknown
}): boolean {
  return row.sold_by_weight === true
}

/** Produtos pesáveis não entram no cardápio público online. */
export function isPublicMenuProduct(row: { sold_by_weight?: unknown }): boolean {
  return !isSoldByWeight(row)
}

export function filterPublicMenuProducts<T extends { sold_by_weight?: unknown }>(
  rows: T[]
): T[] {
  return rows.filter(isPublicMenuProduct)
}

export function normalizeWeighableFields(
  row: Record<string, unknown>
): WeighableProductFields {
  const sold = isSoldByWeight(row)
  const pricePerKg = sold ? parseOptionalNum(row.price_per_kg) : null
  const plu = sold ? normalizePluCode(row.plu_code) : null

  return {
    sold_by_weight: sold,
    price_per_kg: pricePerKg != null && pricePerKg > 0 ? roundMoneyBrl(pricePerKg) : null,
    plu_code: plu,
    default_tare_kg: parseWeightBound(row.default_tare_kg, 0),
    min_weight_kg: parseWeightBound(row.min_weight_kg, DEFAULT_MIN_WEIGHT_KG),
    max_weight_kg: parseWeightBound(row.max_weight_kg, DEFAULT_MAX_WEIGHT_KG),
  }
}

/** Preço/kg efectivo (promoções por canal não se aplicam a pesáveis na fase 1). */
export function effectivePricePerKg(row: {
  sold_by_weight?: unknown
  price_per_kg?: unknown
  price?: unknown
}): number | null {
  if (!isSoldByWeight(row)) return null
  const perKg = parseOptionalNum(row.price_per_kg)
  if (perKg != null && perKg > 0) return roundMoneyBrl(perKg)
  const legacy = parseOptionalNum(row.price)
  return legacy != null && legacy > 0 ? roundMoneyBrl(legacy) : null
}

export function formatWeightKg(weightKg: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(weightKg)
}

export function formatPricePerKg(pricePerKg: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pricePerKg)
}

export type WeighableValidationResult =
  | { ok: true }
  | { ok: false; error: string }

export function validateWeighableProductInput(
  input: WeighableProductInput
): WeighableValidationResult {
  if (!input.sold_by_weight) return { ok: true }

  const pricePerKg = parseOptionalNum(input.price_per_kg)
  if (pricePerKg == null || pricePerKg <= 0) {
    return { ok: false, error: 'Informe o preço por kg para produtos pesáveis.' }
  }

  const plu = normalizePluCode(input.plu_code)
  if (!plu) {
    return {
      ok: false,
      error: 'Informe um código PLU válido (2 a 5 dígitos) para produtos pesáveis.',
    }
  }

  const minKg = parseWeightBound(input.min_weight_kg, DEFAULT_MIN_WEIGHT_KG)
  const maxKg = parseWeightBound(input.max_weight_kg, DEFAULT_MAX_WEIGHT_KG)
  if (minKg > maxKg) {
    return { ok: false, error: 'O peso mínimo não pode ser maior que o peso máximo.' }
  }

  const tare = parseWeightBound(input.default_tare_kg, 0)
  if (tare >= maxKg) {
    return { ok: false, error: 'A tara padrão deve ser menor que o peso máximo.' }
  }

  return { ok: true }
}

export function validateWeighableLineWeight(
  row: Pick<WeighableProductFields, 'min_weight_kg' | 'max_weight_kg'>,
  weightKg: number
): WeighableValidationResult {
  const w = roundWeightKg(weightKg)
  if (!Number.isFinite(w) || w <= 0) {
    return { ok: false, error: 'Peso inválido.' }
  }
  if (w < row.min_weight_kg) {
    return {
      ok: false,
      error: `Peso abaixo do mínimo (${formatWeightKg(row.min_weight_kg)} kg).`,
    }
  }
  if (w > row.max_weight_kg) {
    return {
      ok: false,
      error: `Peso acima do máximo (${formatWeightKg(row.max_weight_kg)} kg).`,
    }
  }
  return { ok: true }
}

/** Campos DB ao criar/actualizar produto pesável. */
export function buildWeighableProductDbPatch(
  input: WeighableProductInput
): Record<string, unknown> {
  if (!input.sold_by_weight) {
    return {
      sold_by_weight: false,
      price_per_kg: null,
      plu_code: null,
      default_tare_kg: 0,
      min_weight_kg: DEFAULT_MIN_WEIGHT_KG,
      max_weight_kg: DEFAULT_MAX_WEIGHT_KG,
    }
  }

  const validation = validateWeighableProductInput(input)
  if (!validation.ok) {
    throw new Error(validation.error)
  }

  const pricePerKg = roundMoneyBrl(Number(input.price_per_kg))
  const plu = normalizePluCode(input.plu_code)!

  return {
    sold_by_weight: true,
    price_per_kg: pricePerKg,
    plu_code: plu,
    price: pricePerKg,
    unidade: 'KG',
    default_tare_kg: parseWeightBound(input.default_tare_kg, 0),
    min_weight_kg: parseWeightBound(input.min_weight_kg, DEFAULT_MIN_WEIGHT_KG),
    max_weight_kg: parseWeightBound(input.max_weight_kg, DEFAULT_MAX_WEIGHT_KG),
  }
}

export type WeighableOrderLineInput = {
  product_id: string
  name: string
  weight_kg: number
  price_per_kg: number
}

/** Linha de pedido para item pesável (quantity = peso em kg). */
export function buildWeighableOrderItemRow(
  orderId: string,
  line: WeighableOrderLineInput
): {
  order_id: string
  product_id: string
  name: string
  quantity: number
  unit_price: number
  price: number
  unit_type: OrderItemUnitType
  weight_kg: number
  price_per_kg_snapshot: number
} {
  const weightKg = roundWeightKg(line.weight_kg)
  const pricePerKg = roundMoneyBrl(line.price_per_kg)
  const lineTotal = roundMoneyBrl(pricePerKg * weightKg)

  return {
    order_id: orderId,
    product_id: line.product_id,
    name: line.name,
    quantity: weightKg,
    unit_price: pricePerKg,
    price: lineTotal,
    unit_type: 'weight',
    weight_kg: weightKg,
    price_per_kg_snapshot: pricePerKg,
  }
}
