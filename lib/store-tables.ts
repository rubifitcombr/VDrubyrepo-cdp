/** Colunas legadas (nome/ativo) e novas (name/active) coexistem na BD. */

export const STORE_TABLES_SELECT =
  'id, store_id, nome, name, ambiente, ativo, active, sort_order'

export type StoreTableRow = {
  id: string
  store_id: string
  name: string
  ambiente: string
  active: boolean
  sort_order: number
}

export function mapStoreTableRow(row: Record<string, unknown>): StoreTableRow {
  const name = String(row.name ?? row.nome ?? '').trim() || '—'
  // `active`/`ativo` podem ser NULL em linhas antigas — tratar só `false` como inactivo.
  const active = row.active !== false && row.ativo !== false
  return {
    id: String(row.id ?? ''),
    store_id: String(row.store_id ?? ''),
    name,
    ambiente: String(row.ambiente ?? 'Salão').trim() || 'Salão',
    active,
    sort_order: Math.round(Number(row.sort_order) || 0),
  }
}

/**
 * Não filtrar com `.eq('active', true)` no PostgREST: linhas com `active` NULL
 * (legado só com `ativo`) desapareciam do mapa de mesas.
 */
export function mapActiveStoreTableRows(
  rows: Record<string, unknown>[] | null | undefined
): StoreTableRow[] {
  return (rows ?? [])
    .map(mapStoreTableRow)
    .filter((t) => t.active && Boolean(t.id))
}

export function sortStoreTableRows(rows: StoreTableRow[]): StoreTableRow[] {
  return [...rows].sort((a, b) => {
    const amb = a.ambiente.localeCompare(b.ambiente, 'pt')
    if (amb !== 0) return amb
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.name.localeCompare(b.name, 'pt')
  })
}

export function buildStoreTableInsertRow(
  storeId: string,
  table: {
    name: string
    ambiente: string
    sort_order: number
    active: boolean
  }
) {
  return {
    store_id: storeId,
    nome: table.name,
    name: table.name,
    ativo: table.active,
    active: table.active,
    ambiente: table.ambiente,
    sort_order: table.sort_order,
  }
}
