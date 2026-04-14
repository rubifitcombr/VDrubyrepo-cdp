/** Dados do bloco “Comparativo” na página Financeiro (séries longas → Relatórios). */
export type FinanceCompareData = {
  compare: {
    today: number
    yesterday: number
    /** Segunda → hoje (semana civil, horário SP). */
    weekCurrent: number
    /** Semana passada completa (segunda a domingo). */
    weekPrevious: number
    monthPartial: number
    monthPrevSameDays: number
  }
}
