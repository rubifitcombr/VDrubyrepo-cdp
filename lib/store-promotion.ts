export type StorePromotionRow = {
  id: string
  store_id: string
  name: string
  description: string | null
  valid_until: string | null
  /** Preço de referência da campanha (opcional). */
  promotional_price?: number | string | null
  active: boolean
  created_at: string
}
