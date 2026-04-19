/** Colunas `stores` após migração manual (compat. leitura durante deploy). */
export function readStoreStatus(row: Record<string, unknown>): unknown {
  return row.status ?? row.merchant_status
}

export function readStorePlano(row: Record<string, unknown>): unknown {
  return row.plano ?? row.plan
}
