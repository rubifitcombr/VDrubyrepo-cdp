import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import type { Plan } from '@/lib/plan'

/**
 * Pedidos criados pelo cardápio público (slug / QR entrega ou retirada).
 * Exclui PDV, garçom e QR de mesa (`autoatendimento`).
 */
export const SLUG_CHANNEL_ORDER_SOURCES = [
  'site_live',
  'site_start',
  'menu_link',
  'site_pickup',
] as const

export function isSlugChannelOrderSource(source: string | null | undefined): boolean {
  const s = String(source ?? '').trim().toLowerCase()
  return (SLUG_CHANNEL_ORDER_SOURCES as readonly string[]).includes(s)
}

/** Growth em modo delivery: painel de pedidos, KPIs e relatórios só contam o canal online (slug/QR). */
export function dashboardUsesSlugChannelOrdersOnly(
  plan: Plan,
  operationMode: MerchantOperationMode | null
): boolean {
  return plan === 'GROWTH' && operationMode === 'delivery'
}

export function slugChannelSourcesForSupabaseIn(): string[] {
  return [...SLUG_CHANNEL_ORDER_SOURCES]
}
