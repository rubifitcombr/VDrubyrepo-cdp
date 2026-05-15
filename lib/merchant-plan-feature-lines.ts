import { menuKeysForMerchant } from '@/lib/dashboard-menu'
import type { DashboardMenuKey } from '@/lib/dashboard-menu-types'
import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import {
  hasAiMenuPhotoImport,
  hasFeature,
  hasMarketingAiDescription,
  hasProMarketingAi,
  type Plan,
} from '@/lib/plan'

const KEY_LABEL: Record<DashboardMenuKey, string> = {
  dashboard: 'Dashboard',
  produtos: 'Produtos e cardápio',
  pedidos: 'Pedidos em tempo real',
  entregadores: 'Gestão de entregadores',
  garcom: 'Garçom / QR salão',
  pdv: 'PDV balcão',
  kds: 'KDS (monitor de cozinha)',
  caixa: 'Caixa',
  promocoes: 'Promoções e cupons',
  relatorios: 'Relatórios de vendas',
  configuracoes: 'Configurações',
  aparencia: 'Aparência da loja online',
  automacoes: 'Automações (WhatsApp)',
  impressao: 'Impressão automática',
  assinatura: 'Assinatura e faturação',
}

/** Ordem estável (alinhada ao sidebar) para listagens na página de planos. */
const KEY_ORDER: DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'pedidos',
  'entregadores',
  'garcom',
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
  if (hasProMarketingAi(plan)) {
    lines.push('Imagem de produto com IA')
  }
  if (operationMode === 'hibrido' && plan === 'START') {
    if (!lines.some((l) => l.includes('Link público'))) {
      lines.push('Link público e QR de pedidos (entrega/retirada)')
    }
    if (!lines.some((l) => l.includes('Taxa de entrega'))) {
      lines.push('Taxa de entrega e zona de entrega (raio em km)')
    }
  }
  return lines
}
