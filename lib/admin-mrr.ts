import type { Plan } from '@/lib/plan'

/** Valores mensais (BRL) para MRR estimado no admin — alinhado à tabela comercial. */
export const VALOR_MENSAL_PLANO: Record<Plan, number> = {
  START: 49.9,
  GROWTH: 99.9,
  PRO: 149.9,
  MASTER: 249.9,
}
