/**
 * Cálculo de frete fixo + frete grátis por valor do pedido (subtotal).
 * Usado no checkout, simulador e UI do cardápio.
 */

export function computeDeliveryCharge(
  subtotal: number,
  baseFee: number | null | undefined,
  freeAbove: number | null | undefined
): number {
  const sub = Number.isFinite(subtotal) && subtotal >= 0 ? subtotal : 0
  const fee =
    baseFee != null && Number.isFinite(Number(baseFee)) && Number(baseFee) >= 0
      ? Number(baseFee)
      : 0
  const threshold =
    freeAbove != null &&
    Number.isFinite(Number(freeAbove)) &&
    Number(freeAbove) > 0
      ? Number(freeAbove)
      : null
  if (threshold != null && sub >= threshold) return 0
  return fee
}
