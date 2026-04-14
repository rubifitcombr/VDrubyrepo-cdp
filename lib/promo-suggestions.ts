import type { PromoKind, SchedulePreset } from '@/lib/promo-guided'

/** Sugestão gerada a partir de pedidos (45 dias, exc. cancelados). */
export type PromotionSuggestionDTO = {
  id: string
  title: string
  body: string
  metricsSummary: string
  kind: PromoKind
  productIds: string[]
  productNames: string[]
  schedulePreset: SchedulePreset
  timeStart: string | null
  timeEnd: string | null
  validFrom: string | null
  validUntil: string | null
  suggestedPromoName: string
}
