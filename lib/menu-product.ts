import { resolveMenuImageUrl } from '@/lib/menu-image-url'
import {
  normalizeWeighableFields,
  WEIGHABLE_PRODUCT_COLUMNS,
  type WeighableProductFields,
} from '@/lib/weighable-product'

/** Colunas lidas pelo gestor de cardápio (alinhado com migrations de preço por canal). */
export const MENU_PRODUCT_SELECT =
  `id, name, category, price, promotional_price, promotion_active, delivery_price, dine_in_price, delivery_promotional_price, delivery_promotion_active, dine_in_promotional_price, dine_in_promotion_active, image_url, active, description, sort_order, ${WEIGHABLE_PRODUCT_COLUMNS}`

/**
 * PDV e listagens sem texto longo: omite `description` para menos payload JSON.
 */
export const MENU_PRODUCT_PDV_SELECT =
  `id, name, category, price, promotional_price, promotion_active, delivery_price, dine_in_price, delivery_promotional_price, delivery_promotion_active, dine_in_promotional_price, dine_in_promotion_active, image_url, active, sort_order, ${WEIGHABLE_PRODUCT_COLUMNS}`

export type MenuProductRow = {
  id: string
  name: string
  category: string | null
  price: number | string | null
  promotional_price: number | string | null
  promotion_active: boolean | null
  delivery_price: number | string | null
  dine_in_price: number | string | null
  delivery_promotional_price: number | string | null
  delivery_promotion_active: boolean | null
  dine_in_promotional_price: number | string | null
  dine_in_promotion_active: boolean | null
  image_url: string | null
  active: boolean | null
  description: string | null
  sort_order: number | null
} & WeighableProductFields

export function normalizeMenuProductRow(
  row: Record<string, unknown>,
  storeId?: string | null
): MenuProductRow {
  const resolvedStoreId =
    storeId ?? (typeof row.store_id === 'string' ? row.store_id : null)
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
    delivery_price:
      row.delivery_price != null ? (row.delivery_price as number | string) : null,
    dine_in_price:
      row.dine_in_price != null ? (row.dine_in_price as number | string) : null,
    delivery_promotional_price:
      row.delivery_promotional_price != null
        ? (row.delivery_promotional_price as number | string)
        : null,
    delivery_promotion_active:
      typeof row.delivery_promotion_active === 'boolean'
        ? row.delivery_promotion_active
        : null,
    dine_in_promotional_price:
      row.dine_in_promotional_price != null
        ? (row.dine_in_promotional_price as number | string)
        : null,
    dine_in_promotion_active:
      typeof row.dine_in_promotion_active === 'boolean'
        ? row.dine_in_promotion_active
        : null,
    image_url: resolveMenuImageUrl(row.image_url, resolvedStoreId),
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
    ...normalizeWeighableFields(row),
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
