import { ordersPresencialChannelVisible } from '@/lib/merchant-operation-mode'
import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import { hasFeature, type Plan } from '@/lib/plan'

/** Balança disponível só em presencial/híbrido (nunca em delivery-only). */
export function isScaleOperationMode(
  mode: MerchantOperationMode | null
): boolean {
  return ordersPresencialChannelVisible(mode)
}

/** Integração de balança — exclusiva do plano Pro em operação presencial. */
export function hasScaleIntegration(
  plan: Plan,
  mode: MerchantOperationMode | null
): boolean {
  return hasFeature(plan, 'scale_integration') && isScaleOperationMode(mode)
}
