export type ReportSeriesPoint = {
  label: string
  revenue: number
  orders: number
  /** YYYY-MM-DD (São Paulo) — útil quando `label` está vazio na série longa. */
  dateKey?: string
}

export type ReportProductRow = {
  name: string
  quantity: number
  revenue: number
  price?: number
}

export type ReportHourRow = {
  hour: number
  label: string
  orders: number
}

export type ReportPaymentMix = {
  pix: number
  card: number
  cash: number
  other: number
  pixPct: number
}

export type ReportPromoSnapshot = {
  /** Linhas de pedido cujo produto está em promoção no cardápio agora (aprox.). */
  promoLines: number
  totalLines: number
  promoSharePct: number
  /** Pedidos distintos que incluem pelo menos uma dessas linhas. */
  ordersWithPromoLine: number
}

export type ReportsAdvancedSummary = {
  /** Últimos 30 dias corridos vs 30 dias anteriores (fuso Brasília). */
  rolling30VsPrior30: {
    revenueCurrent: number
    revenuePrevious: number
    revenuePctChange: number | null
    ordersCurrent: number
    ordersPrevious: number
  }
}

export type ReportsDashboardData = {
  hasEnoughData: boolean
  insights: string[]
  recommendations: string[]
  performance: {
    today: ReportSeriesPoint[]
    d7: ReportSeriesPoint[]
    d30: ReportSeriesPoint[]
  }
  ticket: {
    avgCurrent7d: number
    avgPrev7d: number
    pctChangeVsPrev7d: number | null
    ordersLast7d: number
    /** Projeção: +R$5 em cada pedido × pedidos dos últimos 30d (anualizado /mês). */
    projectedMonthlyGainIfTicketPlus5: number
  }
  hours: ReportHourRow[]
  peakRangeLabel: string
  deadHourLabel: string | null
  products: {
    topByQty: ReportProductRow[]
    topByRevenue: ReportProductRow[]
    slowMovers: ReportProductRow[]
  }
  payment: ReportPaymentMix
  promo: ReportPromoSnapshot | null
  conversionAvailable: false
  /** Plano Pro — comparativo extra e export PDF quando `reports_advanced` está ativo. */
  advanced?: ReportsAdvancedSummary | null
}
