/**
 * Menu do painel por **modelo de operação** × **plano comercial**.
 * Só aplica quando `stores.operation_mode` está definido; `null` = legado (`MENU_POR_PLANO`).
 *
 * **Híbrido** = união (Delivery ∪ Presencial) por tier — ver `unionMenuKeys` e `HIBRIDO_*`.
 *
 * - **Delivery:** Growth com pedidos, promoções, automações (sem Garçom no menu).
 * - **Presencial:** Start com PDV; Growth com PDV + Garçom (QR mesa); Pro com caixa, KDS, impressão.
 * - **Híbrido:** mesma união por plano; preços em `PLAN_MONTHLY_BRL_HIBRIDO` (`lib/plan.ts`).
 *
 * Estoque (`/dashboard/inventory`) continua a depender só de `hasFeature(plan, 'inventory')` em `dashboard-menu`.
 */
import type { DashboardMenuKey } from '@/lib/dashboard-menu-types'
import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import type { Plan } from '@/lib/plan'

type PlanSlug = 'start' | 'growth' | 'pro'

function planSlug(plan: Plan): PlanSlug {
  return plan.toLowerCase() as PlanSlug
}

/** Ordem estável do sidebar (união preserva esta ordem). */
const MENU_KEY_ORDER: DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'pedidos',
  'entregadores',
  'garcom',
  'garcons',
  'pdv',
  'kds',
  'caixa',
  'promocoes',
  'relatorios',
  'configuracoes',
  'aparencia',
  'automacoes',
  'impressao',
  'assinatura',
]

function unionMenuKeys(
  ...lists: readonly (readonly DashboardMenuKey[])[]
): DashboardMenuKey[] {
  const set = new Set<DashboardMenuKey>()
  for (const list of lists) {
    for (const k of list) set.add(k)
  }
  return MENU_KEY_ORDER.filter((k) => set.has(k))
}

const START_BASE: DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'relatorios',
  'configuracoes',
  'assinatura',
]

/** Delivery Growth = fluxo online + automações + entregadores. */
const DELIVERY_GROWTH: DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'pedidos',
  'entregadores',
  'promocoes',
  'relatorios',
  'automacoes',
  'configuracoes',
  'aparencia',
  'assinatura',
]

/** Delivery Pro = cozinha/caixa/impressão; sem PDV nem garçom no menu. */
const DELIVERY_PRO: DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'pedidos',
  'caixa',
  'promocoes',
  'relatorios',
  'automacoes',
  'configuracoes',
  'aparencia',
  'impressao',
  'kds',
  'assinatura',
]

/** Presencial Start = painel + PDV. */
const PRESENCIAL_START: DashboardMenuKey[] = [...START_BASE, 'pdv']

/** Presencial Growth = PDV + garçom (QR mesa) + pedidos em loja. */
const PRESENCIAL_GROWTH: DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'pdv',
  'garcom',
  'garcons',
  'pedidos',
  'promocoes',
  'relatorios',
  'automacoes',
  'configuracoes',
  'aparencia',
  'assinatura',
]

/** Presencial Pro = operação local completa. */
const PRESENCIAL_PRO: DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'garcom',
  'garcons',
  'pedidos',
  'pdv',
  'caixa',
  'promocoes',
  'relatorios',
  'automacoes',
  'configuracoes',
  'aparencia',
  'impressao',
  'kds',
  'assinatura',
]

/** Híbrido = Delivery ∪ Presencial (slug/QR e taxas no dashboard quando Start). */
const HIBRIDO_START = unionMenuKeys(START_BASE, PRESENCIAL_START)
const HIBRIDO_GROWTH = unionMenuKeys(DELIVERY_GROWTH, PRESENCIAL_GROWTH)
const HIBRIDO_PRO = unionMenuKeys(DELIVERY_PRO, PRESENCIAL_PRO)

const MATRIX: Record<
  MerchantOperationMode,
  Record<PlanSlug, readonly DashboardMenuKey[]>
> = {
  delivery: {
    start: START_BASE,
    growth: DELIVERY_GROWTH,
    pro: DELIVERY_PRO,
  },
  presencial: {
    start: PRESENCIAL_START,
    growth: PRESENCIAL_GROWTH,
    pro: PRESENCIAL_PRO,
  },
  hibrido: {
    start: HIBRIDO_START,
    growth: HIBRIDO_GROWTH,
    pro: HIBRIDO_PRO,
  },
}

export function menuKeysForOperationAndPlan(
  plan: Plan,
  operationMode: MerchantOperationMode
): ReadonlySet<DashboardMenuKey> {
  const tier = planSlug(plan)
  const list = MATRIX[operationMode][tier]
  return new Set(list)
}

