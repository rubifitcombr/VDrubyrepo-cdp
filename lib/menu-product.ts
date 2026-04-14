/** Colunas lidas pelo gestor de cardápio (alinhado com `scripts/supabase-menu-columns.sql`). */
export const MENU_PRODUCT_SELECT =
  'id, name, category, price, promotional_price, promotion_active, image_url, active, description, sort_order'

/** Cardápio no painel: `promotion_active` na BD corresponde a “is_promotion” na especificação. */
export type MenuProductRow = {
  id: string
  name: string
  category: string | null
  price: number | string | null
  promotional_price: number | string | null
  promotion_active: boolean | null
  image_url: string | null
  active: boolean | null
  description: string | null
  sort_order: number | null
}

/** Mapeia linha `select('*')` quando ainda não existem colunas extra do cardápio. */
export function normalizeMenuProductRow(
  row: Record<string, unknown>
): MenuProductRow {
  const so = row.sort_order
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    category: row.category != null ? String(row.category) : null,
    price: (row.price as number | string | null) ?? null,
    promotional_price:
      row.promotional_price != null
        ? (row.promotional_price as number | string)
        : null,
    promotion_active:
      typeof row.promotion_active === 'boolean' ? row.promotion_active : null,
    image_url: row.image_url != null ? String(row.image_url) : null,
    active:
      typeof row.active === 'boolean'
        ? row.active
        : row.active == null
          ? null
          : Boolean(row.active),
    description: row.description != null ? String(row.description) : null,
    sort_order:
      so != null && so !== '' && !Number.isNaN(Number(so))
        ? Number(so)
        : null,
  }
}

export function sortMenuProductRows(rows: MenuProductRow[]): MenuProductRow[] {
  return [...rows].sort((a, b) => {
    const so =
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    if (so !== 0) return so
    return a.name.localeCompare(b.name, 'pt')
  })
}
