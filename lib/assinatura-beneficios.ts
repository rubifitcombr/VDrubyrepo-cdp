import type { Plan } from '@/lib/plan'

type PlanoSlug = 'start' | 'growth' | 'pro'

function slug(plan: Plan): PlanoSlug {
  return plan.toLowerCase() as PlanoSlug
}

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
    'Garçom — pedidos por mesa',
    'Impressão automática de pedidos',
    'Descrição e imagem de produto com IA',
    'Relatórios avançados (comparativos e insights extra)',
  ],
}

const PROXIMO_PLANO: Partial<Record<Plan, Plan>> = {
  START: 'GROWTH',
  GROWTH: 'PRO',
}

export function beneficiosDoPlano(plan: Plan): string[] {
  return BENEFICIOS_POR_PLANO[slug(plan)] ?? []
}

export function proximoPlano(plan: Plan): Plan | null {
  return PROXIMO_PLANO[plan] ?? null
}

/** Benefícios do plano seguinte que não existem no plano atual (exclui linhas "Tudo do …"). */
export function beneficiosAdicionaisProximoPlano(
  atual: Plan,
  seguinte: Plan
): string[] {
  const cur = new Set(beneficiosDoPlano(atual))
  return beneficiosDoPlano(seguinte).filter(
    (line) => !/^Tudo do /i.test(line.trim()) && !cur.has(line)
  )
}
