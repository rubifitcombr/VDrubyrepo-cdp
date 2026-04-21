/**
 * Planos comerciais (alinhado à matriz Start / Growth / Pro / Master).
 * Valores em `stores.plano` (ou legado `plan`): start|growth|pro|master ou START|…
 */
export type Plan = 'START' | 'GROWTH' | 'PRO' | 'MASTER'

export type Feature =
  | 'dashboard'
  | 'products'
  /** Plano e faturação (painel) — disponível em todos os planos */
  | 'subscription'
  | 'orders'
  | 'pdv'
  | 'finance'
  /** Financeiro completo (vs. básico no Start) — Growth+ */
  | 'finance_complete'
  | 'promotions'
  | 'reports'
  | 'reports_advanced'
  | 'settings'
  | 'appearance'
  | 'automations'
  | 'printing'
  | 'kds'
  /** Reservado: gestão de estoque, exclusivo Master na matriz comercial */
  | 'inventory'

const PLAN_FEATURES: Record<Plan, Record<Feature, boolean>> = {
  START: {
    dashboard: true,
    products: true,
    subscription: true,
    orders: false,
    pdv: false,
    finance: true,
    finance_complete: false,
    promotions: false,
    reports: false,
    reports_advanced: false,
    settings: true,
    appearance: false,
    automations: false,
    printing: false,
    kds: false,
    inventory: false,
  },
  GROWTH: {
    dashboard: true,
    products: true,
    subscription: true,
    orders: true,
    pdv: true,
    finance: true,
    finance_complete: true,
    promotions: true,
    reports: true,
    reports_advanced: false,
    settings: true,
    appearance: true,
    automations: true,
    printing: false,
    kds: false,
    inventory: false,
  },
  PRO: {
    dashboard: true,
    products: true,
    subscription: true,
    orders: true,
    pdv: true,
    finance: true,
    finance_complete: true,
    promotions: true,
    reports: true,
    reports_advanced: false,
    settings: true,
    appearance: true,
    automations: true,
    printing: true,
    kds: true,
    inventory: false,
  },
  MASTER: {
    dashboard: true,
    products: true,
    subscription: true,
    orders: true,
    pdv: true,
    finance: true,
    finance_complete: true,
    promotions: true,
    reports: true,
    reports_advanced: true,
    settings: true,
    appearance: true,
    automations: true,
    printing: true,
    kds: true,
    inventory: true,
  },
}

export function parsePlan(value: unknown): Plan {
  const v = String(value || '').toUpperCase()
  if (
    v === 'GROWTH' ||
    v === 'PRO' ||
    v === 'START' ||
    v === 'MASTER'
  ) {
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
  return (['START', 'GROWTH', 'PRO', 'MASTER'] as const).filter(
    (p) => planTier(p) > t
  )
}

/** Plano recomendado no upgrade: um nível acima. */
export function recommendedUpgradePlan(plan: Plan): Plan | null {
  const above = plansAbove(plan)
  return above.length ? above[0]! : null
}

/** Badge colorido (fundo claro) alinhado aos locks do sidebar: Start/Growth âmbar, Pro neutro, Master violeta. */
export function planContentBadgeClass(plan: Plan): string {
  switch (plan) {
    case 'START':
      return 'bg-amber-400/15 text-amber-950 ring-1 ring-amber-300/35'
    case 'GROWTH':
      return 'bg-amber-400/15 text-amber-950 ring-1 ring-amber-300/35'
    case 'PRO':
      return 'bg-[#f3f4f6] text-[#1a1614] ring-1 ring-black/10'
    case 'MASTER':
      return 'bg-violet-400/15 text-violet-950 ring-1 ring-violet-300/35'
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

export function hasFeature(plan: Plan, feature: Feature) {
  return !!PLAN_FEATURES[plan]?.[feature]
}

/** Plano mínimo para badge / upgrade (itens com `lock` no menu). */
export type MinPlanForFeature = 'GROWTH' | 'PRO' | 'MASTER'

const FEATURE_MIN_PLAN: Partial<Record<Feature, MinPlanForFeature>> = {
  orders: 'GROWTH',
  finance_complete: 'GROWTH',
  promotions: 'GROWTH',
  reports: 'GROWTH',
  pdv: 'GROWTH',
  automations: 'GROWTH',
  appearance: 'GROWTH',
  printing: 'PRO',
  kds: 'PRO',
  reports_advanced: 'MASTER',
  inventory: 'MASTER',
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
    case 'MASTER':
      return 'Master'
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

const PLAN_MONTHLY_BRL: Record<Plan, number> = {
  START: 49.9,
  GROWTH: 99.9,
  PRO: 149.9,
  MASTER: 249.9,
}

/** Valor mensal em BRL (mesma tabela que `planMonthlyPriceLabel`). */
export function planMonthlyAmountBrl(plan: Plan): number {
  return PLAN_MONTHLY_BRL[plan] ?? PLAN_MONTHLY_BRL.START
}

/** Preço mensal indicativo (BRL) para o painel de assinatura — alinhar com tabela comercial real. */
export function planMonthlyPriceLabel(plan: Plan): string {
  const money = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  return `${money.format(planMonthlyAmountBrl(plan))}/mês`
}

/** Importação de cardápio por foto — Growth em diante (matriz comercial). */
export function hasAiMenuPhotoImport(plan: Plan): boolean {
  return (
    plan === 'GROWTH' || plan === 'PRO' || plan === 'MASTER'
  )
}

/** Descrição e imagem de produto com IA (APIs /api/ai/*) — Pro e Master. */
export function hasProMarketingAi(plan: Plan): boolean {
  return plan === 'PRO' || plan === 'MASTER'
}

/** Acesso à automação de WhatsApp (chatbot simples) — Growth em diante. */
export function hasAutomationAccess(plan: string): boolean {
  return ['GROWTH', 'PRO', 'MASTER'].includes(String(plan || '').toUpperCase())
}

/**
 * Toggles de pedido/loja (confirmação WhatsApp, aceitar pedido, notificação, fechar fora de horas,
 * mensagem de entrega) — Pro e Master. No Growth só a resposta automática com link do cardápio.
 */
export function hasOrderPipelineAutomations(plan: Plan): boolean {
  return planTier(plan) >= planTier('PRO')
}
