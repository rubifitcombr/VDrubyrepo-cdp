import { menuKeysForMerchant } from '@/lib/dashboard-menu'
import type { DashboardMenuKey } from '@/lib/dashboard-menu-types'
import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import {
  hasAiMenuPhotoImport,
  hasFeature,
  hasMarketingAiDescription,
  hasPixCheckout,
  PIX_CHECKOUT_BENEFIT_LINE,
  PIX_CHECKOUT_PRO_ONLY_LINE,
  type Plan,
} from '@/lib/plan'

const KEY_LABEL: Record<DashboardMenuKey, string> = {
  dashboard: 'Dashboard',
  produtos: 'Produtos e cardápio',
  pedidos: 'Pedidos em tempo real',
  entregadores: 'Gestão de entregadores',
  garcom: 'Garçom / QR salão',
  garcons: 'Meus garçons',
  pdv: 'PDV balcão',
  kds: 'KDS (monitor de cozinha)',
  caixa: 'Caixa',
  promocoes: 'Promoções e cupons',
  relatorios: 'Relatórios de vendas',
  configuracoes: 'Configurações',
  fiscal: 'Vyria Fiscal (NFC-e)',
  aparencia: 'Aparência da loja online',
  automacoes: 'Automações (pedidos e loja)',
  impressao: 'Impressão automática',
  balanca: 'Balança (produtos por peso)',
  assinatura: 'Assinatura e faturação',
  master: 'Plano Master (WhatsApp, fidelidade)',
}

/** Ordem estável (alinhada ao sidebar) para listagens na página de planos. */
const KEY_ORDER: DashboardMenuKey[] = [
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
  'fiscal',
  'aparencia',
  'automacoes',
  'impressao',
  'balanca',
  'assinatura',
  'master',
]

/**
 * Lista o que o painel inclui para **plano × modo de operação** (mesmo critério que
 * `menuKeysForMerchant`), mais extras comerciais (stock, IA) que não são chave de menu.
 */
export function planPreviewLinesForMerchant(
  plan: Plan,
  operationMode: MerchantOperationMode | null
): string[] {
  const keys = menuKeysForMerchant(plan, operationMode)
  const lines: string[] = []
  for (const k of KEY_ORDER) {
    if (keys.has(k)) lines.push(KEY_LABEL[k])
  }
  if (hasFeature(plan, 'inventory')) {
    lines.push('Inventário / stock por produto')
  }
  if (hasAiMenuPhotoImport(plan)) {
    lines.push('Importação de cardápio por foto (IA)')
  }
  if (hasMarketingAiDescription(plan)) {
    lines.push('Descrição de produto com IA')
  }
  if (operationMode === 'hibrido' && plan === 'GROWTH') {
    if (!lines.some((l) => l.includes('Link público'))) {
      lines.push('Link público e QR de pedidos (entrega/retirada)')
    }
    if (!lines.some((l) => l.includes('Taxa de entrega'))) {
      lines.push('Taxa de entrega e zona de entrega (raio em km)')
    }
  }
  if (hasPixCheckout(plan)) {
    lines.push(PIX_CHECKOUT_BENEFIT_LINE)
  } else if (plan !== 'MASTER') {
    lines.push(PIX_CHECKOUT_PRO_ONLY_LINE)
  }
  if (hasFeature(plan, 'whatsapp_ai')) {
    lines.push('WhatsApp oficial (Cloud API) — número da loja')
    lines.push('Robô de IA para atendimento ao cliente')
  }
  if (hasFeature(plan, 'loyalty')) {
    lines.push('Programa de fidelidade com cashback')
    lines.push('Consulta de pontos pelo WhatsApp')
  }
  if (hasFeature(plan, 'recovery')) {
    lines.push('Recuperador de clientes inativos')
    lines.push('Relatório de campanhas de recuperação')
  }
  return lines
}
