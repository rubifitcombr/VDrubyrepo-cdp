/** Cálculos de preço para produtos vendidos por peso. */

export function roundWeightKg(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function roundMoneyBrl(n: number): number {
  return Math.round(n * 100) / 100
}

/** Total da linha: preço/kg × peso (kg). */
export function weighableLineTotal(pricePerKg: number, weightKg: number): number {
  return roundMoneyBrl(pricePerKg * weightKg)
}
