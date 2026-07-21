/** Tolerância de centavos para comparar totais de pagamento (arredondamentos). */
export const MONEY_TOLERANCE_BRL = 0.02

export function roundMoneyBrl(n: number): number {
  return Math.round(n * 100) / 100
}

export function moneyWithinTolerance(a: number, b: number, tolerance = MONEY_TOLERANCE_BRL): boolean {
  return Math.abs(roundMoneyBrl(a) - roundMoneyBrl(b)) <= tolerance
}
