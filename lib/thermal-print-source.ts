/** Origem lógica para toggles de impressão térmica automática. */
export type ThermalAutoSource =
  | 'delivery'
  | 'autoatendimento'
  | 'pdv'
  | 'garcom'

/**
 * Mapeia `orders.source` para a categoria de toggle.
 * `site_*` = pedido pelo link do cardápio (entrega / retirada no site).
 */
export function thermalAutoSourceFromOrderSource(
  raw: string | null | undefined
): ThermalAutoSource | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'site_live' || s === 'site_start' || s === 'site_pickup' || s === 'menu_link') {
    return 'delivery'
  }
  if (s === 'autoatendimento') return 'autoatendimento'
  if (s === 'pdv') return 'pdv'
  if (s === 'waiter') return 'garcom'
  return null
}
