import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'

/**
 * Planos comerciais: Start / Growth / Pro / Master.
 * Valores em `stores.plano` (ou legado `plan`): start|growth|pro|master ou START|…
 */
export type Plan = 'START' | 'GROWTH' | 'PRO' | 'MASTER'

/** Planos comerciais activos (sem Start legado). */
export type CommercialPlan = 'GROWTH' | 'PRO'

/** Planos exibidos na página «Conheça nossos planos» (comercial). */
export const COMMERCIAL_PLANS = ['GROWTH', 'PRO'] as const satisfies readonly CommercialPlan[]

export type Feature =
  | 'dashboard'
  | 'products'
  /** Plano e faturação (painel) — disponível em todos os planos */
  | 'subscription'
  | 'orders'
  | 'pdv'
  | 'promotions'
  | 'reports'
  | 'reports_advanced'
  | 'settings'
  | 'appearance'
  | 'automations'
  | 'printing'
  | 'kds'
  /** Gestão de estoque — exclusivo do plano Pro. */
  | 'inventory'
  | 'waiter'
  | 'cashier'
  /** PIX no checkout público (QR / copia e cola) — exclusivo Pro. */
  | 'pix_checkout'
  /** Integração de balança (produtos pesáveis, PDV/garçom) — exclusivo Pro, presencial. */
  | 'scale_integration'
  /** WhatsApp Cloud API + robô IA — exclusivo Master. */
  | 'whatsapp_ai'
  /** Programa de fidelidade — exclusivo Master. */
  | 'loyalty'
  /** Recuperador de clientes — exclusivo Master. */
  | 'recovery'

const PLAN_FEATURES: Record<Plan, Record<Feature, boolean>> = {
  START: {
    dashboard: true,
    products: true,
    subscription: true,
    orders: false,
    pdv: false,
    promotions: false,
    reports: true,
    reports_advanced: false,
    settings: true,
    appearance: false,
    automations: false,
    printing: false,
    kds: false,
    inventory: false,
    waiter: false,
    cashier: false,
    pix_checkout: false,
    scale_integration: false,
    whatsapp_ai: false,
    loyalty: false,
    recovery: false,
  },
  GROWTH: {
    dashboard: true,
    products: true,
    subscription: true,
    orders: true,
    pdv: true,
    promotions: true,
    reports: true,
    reports_advanced: false,
    settings: true,
    appearance: true,
    automations: true,
    printing: false,
    kds: false,
    inventory: false,
    waiter: false,
    cashier: false,
    pix_checkout: false,
    scale_integration: false,
    whatsapp_ai: false,
    loyalty: false,
    recovery: false,
  },
  PRO: {
    dashboard: true,
    products: true,
    subscription: true,
    orders: true,
    pdv: true,
    promotions: true,
    reports: true,
    reports_advanced: true,
    settings: true,
    appearance: true,
    automations: true,
    printing: true,
    kds: true,
    inventory: true,
    waiter: true,
    cashier: true,
    pix_checkout: true,
    scale_integration: true,
    whatsapp_ai: false,
    loyalty: false,
    recovery: false,
  },
  MASTER: {
    dashboard: true,
    products: true,
    subscription: true,
    orders: true,
    pdv: true,
    promotions: true,
    reports: true,
    reports_advanced: true,
    settings: true,
    appearance: true,
    automations: true,
    printing: true,
    kds: true,
    inventory: true,
    waiter: true,
    cashier: true,
    pix_checkout: true,
    scale_integration: true,
    whatsapp_ai: true,
    loyalty: true,
    recovery: true,
  },
}

/** Texto comercial nas páginas de planos. */
export const PIX_CHECKOUT_BENEFIT_LINE =
  'Pagamento PIX no checkout (QR Code — valor directo na conta do lojista)'

export const PIX_CHECKOUT_PRO_ONLY_LINE =
  'Pagamento PIX no checkout — exclusivo do plano Pro'

export function hasPixCheckout(plan: Plan): boolean {
  return hasFeature(plan, 'pix_checkout')
}

export function parsePlan(value: unknown): Plan {
  const v = String(value || '').trim().toUpperCase()
  if (v === 'GROWTH' || v === 'PRO' || v === 'START' || v === 'MASTER') {
    return v
  }
  return 'START'
}

/** Nome curto do plano (badge / UI). */
export function planShortLabel(plan: Plan): string {
  switch (plan) {
    case 'START':
      return 'Start'
    case 'GROWTH':
      return 'Growth'
    case 'PRO':
      return 'Pro'
    case 'MASTER':
      return 'Master'
    default:
      return 'Start'
  }
}

/** Planos com tier superior ao atual (para upgrade). */
export function plansAbove(plan: Plan): Plan[] {
  const t = planTier(plan)
  return (['START', 'GROWTH', 'PRO', 'MASTER'] as const).filter((p) => planTier(p) > t)
}

/** Plano recomendado no upgrade: um nível acima. */
export function recommendedUpgradePlan(plan: Plan): Plan | null {
  const above = plansAbove(plan)
  return above.length ? above[0]! : null
}

/** Badge colorido (fundo claro) alinhado aos locks do sidebar: Start/Growth âmbar, Pro neutro. */
export function planContentBadgeClass(plan: Plan): string {
  switch (plan) {
    case 'START':
      return 'bg-amber-400/15 text-amber-950 ring-1 ring-amber-300/35'
    case 'GROWTH':
      return 'bg-amber-400/15 text-amber-950 ring-1 ring-amber-300/35'
    case 'PRO':
      return 'bg-[#f3f4f6] text-[#1a1614] ring-1 ring-black/10'
    case 'MASTER':
      return 'bg-violet-100 text-violet-950 ring-1 ring-violet-300/40'
    default:
      return 'bg-amber-400/15 text-amber-950 ring-1 ring-amber-300/35'
  }
}

/** Ordem comercial (0 = mais baixo). Útil para comparar plano da loja vs. atalhos de dev. */
export function planTier(plan: Plan): number {
  switch (plan) {
    case 'START':
      return 0
    case 'GROWTH':
      return 1
    case 'PRO':
      return 2
    case 'MASTER':
      return 3
    default:
      return 0
  }
}

/** Cadastro de entregadores, corridas e acertos — a partir do plano Growth. */
export function merchantEntregadoresEnabled(plan: Plan): boolean {
  return planTier(plan) >= planTier('GROWTH')
}

export function hasFeature(plan: Plan, feature: Feature) {
  return !!PLAN_FEATURES[plan]?.[feature]
}

/** Plano mínimo para badge / upgrade (itens com `lock` no menu). */
export type MinPlanForFeature = 'GROWTH' | 'PRO'

const FEATURE_MIN_PLAN: Partial<Record<Feature, MinPlanForFeature>> = {
  orders: 'GROWTH',
  promotions: 'GROWTH',
  pdv: 'GROWTH',
  automations: 'GROWTH',
  appearance: 'GROWTH',
  printing: 'PRO',
  kds: 'PRO',
  reports_advanced: 'PRO',
  inventory: 'PRO',
  waiter: 'PRO',
  cashier: 'PRO',
  pix_checkout: 'PRO',
  scale_integration: 'PRO',
}

export function minPlanForFeature(feature: Feature): MinPlanForFeature | null {
  return FEATURE_MIN_PLAN[feature] ?? null
}

export function planBadgeLabel(minPlan: MinPlanForFeature): string {
  switch (minPlan) {
    case 'GROWTH':
      return 'Growth'
    case 'PRO':
      return 'Pro'
    default:
      return 'Growth'
  }
}

/** Rótulo do plano atual (cabeçalho do painel). */
export function planTitle(plan: Plan): string {
  switch (plan) {
    case 'START':
      return 'Plano Start'
    case 'GROWTH':
      return 'Plano Growth'
    case 'PRO':
      return 'Plano Pro'
    case 'MASTER':
      return 'Plano Master'
    default:
      return 'Plano Start'
  }
}

/** Delivery e Presencial (tabela base). */
const PLAN_MONTHLY_BRL: Record<Plan, number> = {
  START: 49.9,
  GROWTH: 89.9,
  PRO: 139.9,
  MASTER: 199.9,
}

/** Híbrido = união comercial Delivery + Presencial (preço superior). */
const PLAN_MONTHLY_BRL_HIBRIDO: Record<Plan, number> = {
  START: 69.9,
  GROWTH: 109.9,
  PRO: 149.9,
  MASTER: 209.9,
}

function planMonthlyTable(
  operationMode: MerchantOperationMode | null | undefined
): Record<Plan, number> {
  return operationMode === 'hibrido' ? PLAN_MONTHLY_BRL_HIBRIDO : PLAN_MONTHLY_BRL
}

/** Valor mensal em BRL (mesma tabela que `planMonthlyPriceLabel`). */
export function planMonthlyAmountBrl(
  plan: Plan,
  operationMode: MerchantOperationMode | null = null
): number {
  const table = planMonthlyTable(operationMode)
  return table[plan] ?? table.START
}

/** Preço mensal indicativo (BRL) para o painel de assinatura — alinhar com tabela comercial real. */
export function planMonthlyPriceLabel(
  plan: Plan,
  operationMode: MerchantOperationMode | null = null
): string {
  const money = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  return `${money.format(planMonthlyAmountBrl(plan, operationMode))}/mês`
}

const moneyBrl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/**
 * Linha com os três valores mensais (BRL) para o modelo indicado.
 */
export function planMonthlyPricesCatalogLinePt(
  operationMode: MerchantOperationMode | null = null
): string {
  return `Growth ${moneyBrl.format(planMonthlyAmountBrl('GROWTH', operationMode))} · Pro ${moneyBrl.format(planMonthlyAmountBrl('PRO', operationMode))}/mês`
}

/** Importação de cardápio por foto — Growth em diante (matriz comercial). */
export function hasAiMenuPhotoImport(plan: Plan): boolean {
  return plan === 'GROWTH' || plan === 'PRO' || plan === 'MASTER'
}

/** Geração de descrição com IA (API /api/ai/product-description) — a partir do Growth. */
export function hasMarketingAiDescription(plan: Plan): boolean {
  return planTier(plan) >= planTier('GROWTH')
}

/**
 * Automações de pedido/loja (aceitar pedido, notificação, fechar fora de horas)
 * — Growth em diante (slug, PDV, garçom/QR, autoatendimento).
 */
export function hasOrderPipelineAutomations(plan: Plan): boolean {
  return planTier(plan) >= planTier('GROWTH')
}

/** @deprecated Use `hasOrderPipelineAutomations` — WhatsApp Evolution foi removido. */
export function hasAutomationAccess(plan: string): boolean {
  return hasOrderPipelineAutomations(parsePlan(plan))
}
