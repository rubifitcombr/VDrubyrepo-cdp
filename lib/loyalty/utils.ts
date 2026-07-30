import type { LoyaltyLedgerKind, StoreLoyaltyConfig } from '@/lib/loyalty/types'

export function moneyFromLoyaltyPoints(points: number, centsPerPoint: number): number {
  return Math.round(points * centsPerPoint) / 100
}

export function formatLoyaltyMoney(valueBrl: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valueBrl)
}

export function ledgerKindLabel(kind: LoyaltyLedgerKind): string {
  switch (kind) {
    case 'earn':
      return 'Ganho'
    case 'redeem':
      return 'Resgate'
    case 'welcome':
      return 'Boas-vindas'
    case 'adjust':
    default:
      return 'Ajuste'
  }
}

export function calculateEarnPoints(orderTotalBrl: number, pointsPerReal: number): number {
  if (orderTotalBrl <= 0 || pointsPerReal <= 0) return 0
  return Math.floor(orderTotalBrl * pointsPerReal)
}

/** Máximo de pontos resgatáveis dado saldo e total do pedido. */
export function calculateMaxRedeemablePoints(
  config: Pick<StoreLoyaltyConfig, 'enabled' | 'min_redeem_points' | 'redeem_cents_per_point'>,
  balance: number,
  orderTotalBrl: number
): number {
  if (!config.enabled || balance <= 0 || orderTotalBrl <= 0) return 0
  if (config.redeem_cents_per_point <= 0) return 0

  const maxByTotal = Math.floor((orderTotalBrl * 100) / config.redeem_cents_per_point)
  const capped = Math.max(0, Math.min(balance, maxByTotal))
  if (capped < config.min_redeem_points) return 0
  return capped
}

export function resolveRedeemPoints(
  config: Pick<
    StoreLoyaltyConfig,
    'enabled' | 'min_redeem_points' | 'redeem_cents_per_point'
  >,
  balance: number,
  orderTotalBrl: number,
  requested: number
): { points: number; discountBrl: number } {
  const max = calculateMaxRedeemablePoints(config, balance, orderTotalBrl)
  if (max < config.min_redeem_points) return { points: 0, discountBrl: 0 }

  const points = Math.min(Math.max(0, Math.floor(requested)), max)
  if (points < config.min_redeem_points) return { points: 0, discountBrl: 0 }

  const discountBrl = Math.min(
    orderTotalBrl,
    Math.round(moneyFromLoyaltyPoints(points, config.redeem_cents_per_point) * 100) / 100
  )
  return { points, discountBrl }
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  return phone
}
