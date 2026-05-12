/**
 * Menu do painel por **modelo de operação** × **plano comercial**.
 * Só aplica quando `stores.operation_mode` está definido; `null` = legado (`MENU_POR_PLANO`).
 *
 * Resumo alinhado ao produto:
 * - **Delivery:** Growth com pedidos, garçom/QR salão (autoatendimento), promoções, relatórios, aparência, automações (WhatsApp).
 *   Pro acrescenta caixa, impressão, KDS (sem PDV no menu delivery).
 * - **Presencial:** Start com PDV; Growth com PDV, garçom (QR mesa / autoatendimento), pedidos, etc.;
 *   Pro acrescenta caixa, impressão, KDS. Sem canal online (slug público de pedidos, entregas).
 * - **Híbrido:** Growth com PDV, pedidos, promoções, etc.; Pro com garçom, caixa, impressão, KDS
 *   (mantém fluxo misto presencial + online).
 * - **Start** com modo definido: em delivery/híbrido = dashboard, produtos, relatórios, configurações,
 *   assinatura; em **presencial** inclui também o **PDV**.
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

const START_BASE: DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'relatorios',
  'configuracoes',
  'assinatura',
]

/** Delivery Growth = fluxo online + automações + Garçom (QR autoatendimento no salão). */
const DELIVERY_GROWTH: DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'pedidos',
  'garcom',
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

/** Presencial Start = só painel + PDV (sem pedidos online no menu). */
const PRESENCIAL_START: DashboardMenuKey[] = [...START_BASE, 'pdv']

/** Presencial Growth = PDV + garçom (QR mesa desde Growth) + pedidos em loja. */
const PRESENCIAL_GROWTH: DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'pdv',
  'garcom',
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

/** Híbrido Growth = balcão + pedidos + automações (inclui canal online). */
const HIBRIDO_GROWTH: DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'pdv',
  'pedidos',
  'promocoes',
  'relatorios',
  'automacoes',
  'configuracoes',
  'aparencia',
  'assinatura',
]

/** Híbrido Pro = operação mista completa. */
const HIBRIDO_PRO: DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'garcom',
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
    start: START_BASE,
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
