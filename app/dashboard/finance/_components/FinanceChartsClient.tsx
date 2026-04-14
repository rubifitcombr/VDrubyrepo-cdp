'use client'

import type { FinanceCompareData } from '@/lib/finance-charts'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function pctLabel(cur: number, prev: number): string {
  if (prev <= 0) return cur > 0 ? 'Novo' : '—'
  const p = Math.round(((cur - prev) / prev) * 100)
  if (p > 0) return `+${p}%`
  if (p < 0) return `${p}%`
  return '0%'
}

function CompareTrend({ cur, prev }: { cur: number; prev: number }) {
  if (prev <= 0 && cur <= 0) {
    return <span className="text-sm text-[#9ca3af]">—</span>
  }
  if (prev <= 0 && cur > 0) {
    return (
      <span className="text-sm font-semibold text-emerald-700" title="Sem base no período anterior">
        Novo
      </span>
    )
  }
  const p = ((cur - prev) / prev) * 100
  const label = pctLabel(cur, prev)
  if (p > 0.5) {
    return (
      <span className="text-sm font-semibold text-emerald-700">
        <span aria-hidden>🔼</span> {label}
      </span>
    )
  }
  if (p < -0.5) {
    return (
      <span className="text-sm font-semibold text-red-600">
        <span aria-hidden>🔽</span> {label}
      </span>
    )
  }
  return <span className="text-sm font-semibold text-[#6b7280]">{label}</span>
}

export function FinanceChartsClient({ data }: { data: FinanceCompareData }) {
  const { compare } = data

  return (
    <section
      className="mt-8 space-y-8"
      aria-label="Comparativo financeiro"
    >
      <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04] sm:p-6">
        <h2 className="text-lg font-bold text-[#1a1614]">Comparativo inteligente</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Hoje vs ontem
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-[#1a1614]">
              {money.format(compare.today)}
            </p>
            <p className="mt-1 text-xs text-[#6b7280]">
              Ontem: {money.format(compare.yesterday)}
            </p>
            <div className="mt-2">
              <CompareTrend cur={compare.today} prev={compare.yesterday} />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Esta semana vs semana passada
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-[#1a1614]">
              {money.format(compare.weekCurrent)}
            </p>
            <p className="mt-1 text-xs text-[#6b7280]">
              Semana passada (seg–dom): {money.format(compare.weekPrevious)}
            </p>
            <div className="mt-2">
              <CompareTrend
                cur={compare.weekCurrent}
                prev={compare.weekPrevious}
              />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Este mês vs mesmo período no mês passado
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-[#1a1614]">
              {money.format(compare.monthPartial)}
            </p>
            <p className="mt-1 text-xs text-[#6b7280]">
              Mês passado (mesmos dias): {money.format(compare.monthPrevSameDays)}
            </p>
            <div className="mt-2">
              <CompareTrend
                cur={compare.monthPartial}
                prev={compare.monthPrevSameDays}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
