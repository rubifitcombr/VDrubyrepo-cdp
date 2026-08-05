import type { SubscriptionBannerCopy } from '@/lib/subscription-billing-types'

export function todayIsoLocal(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export function parseYmd(ymd: string): Date {
  return new Date(ymd.includes('T') ? ymd : `${ymd}T12:00:00`)
}

export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const a = parseYmd(fromYmd).getTime()
  const b = parseYmd(toYmd).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function dueDateForReferenceMonth(referenceMonth: string): string {
  const [y, m] = referenceMonth.split('-').map(Number)
  const lastDay = new Date(y!, m!, 0).getDate()
  const day = Math.min(10, lastDay)
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function currentReferenceMonth(asOf: string = todayIsoLocal()): string {
  return asOf.slice(0, 7)
}

export function isInvoiceOverdue(dueDate: string, asOf: string = todayIsoLocal()): boolean {
  return asOf > dueDate
}

export function isSubscriptionLocked(
  status: string,
  dueDate: string,
  asOf: string = todayIsoLocal()
): boolean {
  return status === 'pending' && isInvoiceOverdue(dueDate, asOf)
}

export function buildSubscriptionBannerCopy(input: {
  amountLabel: string
  dueDate: string
  asOf?: string
}): SubscriptionBannerCopy {
  const asOf = input.asOf ?? todayIsoLocal()
  const dayOfMonth = Number(asOf.slice(8, 10))
  const daysUntilDue = daysBetweenYmd(asOf, input.dueDate)
  const locked = isInvoiceOverdue(input.dueDate, asOf)

  if (locked) {
    return {
      title: 'Painel bloqueado por mensalidade em aberto',
      body: `Regularize o PIX de ${input.amountLabel} para voltar a operar. O acesso ficará suspenso até a confirmação automática do pagamento.`,
      tone: 'locked',
      daysUntilDue,
      dayOfMonth,
      locked: true,
    }
  }

  if (dayOfMonth <= 2) {
    return {
      title: 'Sua mensalidade Vyria está disponível',
      body: `Mantenha sua operação sem interrupções — pague ${input.amountLabel} até o vencimento e continue vendendo com tranquilidade.`,
      tone: 'soft',
      daysUntilDue,
      dayOfMonth,
      locked: false,
    }
  }

  if (dayOfMonth <= 5) {
    return {
      title: 'Não deixe sua loja parar',
      body: `A mensalidade de ${input.amountLabel} vence em ${daysUntilDue} dia(s). Pague agora e evite qualquer risco de bloqueio.`,
      tone: 'urgent',
      daysUntilDue,
      dayOfMonth,
      locked: false,
    }
  }

  return {
    title: 'Últimos dias para pagar sem bloqueio',
    body: `Faltam ${daysUntilDue} dia(s) para o vencimento (${input.amountLabel}). Após o dia 10, o painel será bloqueado até a confirmação do PIX.`,
    tone: 'critical',
    daysUntilDue,
    dayOfMonth,
    locked: false,
  }
}

export function formatMoneyBrl(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount)
}
