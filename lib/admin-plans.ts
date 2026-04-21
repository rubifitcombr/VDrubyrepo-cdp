import type { Plan } from '@/lib/plan'

/** Preços exibidos no painel admin (cobrança manual). */
export const ADMIN_PLAN_OPTIONS: Array<{
  code: Plan
  label: string
  priceLabel: string
}> = [
  { code: 'START', label: 'Start', priceLabel: 'R$ 49,90' },
  { code: 'GROWTH', label: 'Growth', priceLabel: 'R$ 99,90' },
  { code: 'PRO', label: 'Pro', priceLabel: 'R$ 149,90' },
]
