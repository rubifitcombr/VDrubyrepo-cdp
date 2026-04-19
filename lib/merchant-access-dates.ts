/** Compara só datas (YYYY-MM-DD) no fuso local — plano válido até ao fim do dia de vencimento. */
export function isPlanoVencido(
  planoVenceEm: string | null | undefined
): boolean {
  if (!planoVenceEm || !/^\d{4}-\d{2}-\d{2}$/.test(String(planoVenceEm).trim())) {
    return true
  }
  const v = String(planoVenceEm).trim()
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return today > v
}
