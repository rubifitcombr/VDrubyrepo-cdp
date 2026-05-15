import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import type { Plan } from '@/lib/plan'

type PlanoSlug = 'start' | 'growth' | 'pro'

function slug(plan: Plan): PlanoSlug {
  return plan.toLowerCase() as PlanoSlug
}

/** Benefícios por plano quando o modelo da loja **não** é só delivery (legado, presencial ou híbrido). */
export const BENEFICIOS_POR_PLANO: Record<PlanoSlug, string[]> = {
  start: [
    'Dashboard e métricas básicas',
    'Cardápio de produtos',
    'Relatórios de vendas (essencial)',
    'Configurações da loja',
    'Link público da loja',
  ],
  growth: [
    'Tudo do Start',
    'Pedidos em tempo real',
    'Promoções e cupons',
    'Relatórios de vendas',
    'Aparência personalizada (logo, cor, banner)',
    'Importar cardápio por foto (IA)',
  ],
  pro: [
    'Tudo do Growth',
    'KDS — monitor de cozinha',
    'PDV / atendimento balcão',
    'Garçom — pedidos por mesa (conforme modelo)',
    'Impressão automática de pedidos',
    'Descrição e imagem de produto com IA',
    'Relatórios avançados (comparativos e insights extra)',
  ],
}

/**
 * Benefícios alinhados ao modelo **Híbrido** (balcão + canal online).
 * Coerente com `merchant-menu-matrix` para `operation_mode === 'hibrido'`.
 */
export const BENEFICIOS_HIBRIDO: Record<PlanoSlug, string[]> = {
  start: [
    'Dashboard e métricas básicas',
    'Cardápio de produtos',
    'PDV / atendimento no balcão',
    'Relatórios de vendas (essencial)',
    'Link público e QR de pedidos (entrega e retirada)',
    'Taxa de entrega e zona de entrega (raio em km)',
    'Configurações da loja',
  ],
  growth: [
    'Tudo do Start',
    'Pedidos em tempo real (balcão, salão e canal online)',
    'Garçom / QR de mesa no salão',
    'Gestão de entregadores (pedidos online)',
    'Promoções e cupons',
    'Aparência da loja online (logo, cor, banner)',
    'Automações WhatsApp (confirmação e avisos)',
    'Importar cardápio por foto (IA)',
  ],
  pro: [
    'Tudo do Growth',
    'Garçom com mapa de mesas e QR salão',
    'Caixa com turno e fecho de comandas',
    'Impressão automática (cozinha / agente Wi‑Fi)',
    'KDS — monitor de cozinha',
    'Gestão de estoque por produto',
    'Relatórios avançados',
    'Descrição e imagem de produto com IA',
  ],
}

/**
 * Benefícios alinhados ao modelo **Delivery** (pedidos online, link/QR, entregas).
 * Coerente com `merchant-menu-matrix` para `operation_mode === 'delivery'`.
 */
export const BENEFICIOS_DELIVERY: Record<PlanoSlug, string[]> = {
  start: [
    'Dashboard e métricas básicas',
    'Cardápio online e link público da loja',
    'Relatórios de vendas (essencial)',
    'Configurações da loja',
  ],
  growth: [
    'Tudo do Start',
    'Pedidos em tempo real (delivery e retirada no site)',
    'Gestão de entregadores e registo de corridas',
    'Promoções e cupons',
    'Aparência da loja online (logo, cor, banner)',
    'Automações WhatsApp (confirmação e avisos)',
    'Importar cardápio por foto (IA)',
  ],
  pro: [
    'Tudo do Growth',
    'Caixa com turno, pedidos do link/QR e entregas do período',
    'Impressão automática (cozinha / agente Wi‑Fi)',
    'KDS — monitor de cozinha',
    'Gestão de estoque por produto',
    'Relatórios avançados',
    'Descrição e imagem de produto com IA',
  ],
}

const PROXIMO_PLANO: Partial<Record<Plan, Plan>> = {
  START: 'GROWTH',
  GROWTH: 'PRO',
}

export function beneficiosDoPlano(
  plan: Plan,
  operationMode: MerchantOperationMode | null = null
): string[] {
  if (operationMode === 'delivery') {
    return BENEFICIOS_DELIVERY[slug(plan)] ?? []
  }
  if (operationMode === 'hibrido') {
    return BENEFICIOS_HIBRIDO[slug(plan)] ?? []
  }
  return BENEFICIOS_POR_PLANO[slug(plan)] ?? []
}

export function proximoPlano(plan: Plan): Plan | null {
  return PROXIMO_PLANO[plan] ?? null
}

/** Benefícios do plano seguinte que não existem no plano atual (exclui linhas "Tudo do …"). */
export function beneficiosAdicionaisProximoPlano(
  atual: Plan,
  seguinte: Plan,
  operationMode: MerchantOperationMode | null = null
): string[] {
  const cur = new Set(beneficiosDoPlano(atual, operationMode))
  return beneficiosDoPlano(seguinte, operationMode).filter(
    (line) => !/^Tudo do /i.test(line.trim()) && !cur.has(line)
  )
}
