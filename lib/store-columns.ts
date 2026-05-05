/** Colunas `stores` após migração manual (compat. leitura durante deploy). */
export function readStoreStatus(row: Record<string, unknown>): unknown {
  const primary = row.status
  if (
    primary !== null &&
    primary !== undefined &&
    String(primary).trim() !== ''
  ) {
    return primary
  }
  return row.merchant_status
}

export function readStorePlano(row: Record<string, unknown>): unknown {
  return row.plano ?? row.plan
}
