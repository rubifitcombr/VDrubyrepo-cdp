'use client'

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReportSeriesPoint, ReportsDashboardData } from '@/lib/reports-data'
import { ReportsExportButton } from '@/app/dashboard/reports/_components/ReportsExportButton'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function dateLabel(dateKey: string): string {
  if (!dateKey || dateKey.length < 10) return '—'
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`
}

type PerfRange = 'today' | '7d' | '30d'

function InsightList({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <ul className="space-y-3">
      {items.map((t, i) => (
        <li
          key={i}
          className="rounded-xl border border-[var(--card-border)] bg-white/80 px-4 py-3 text-sm leading-relaxed text-[#374151] shadow-sm"
        >
          {t}
        </li>
      ))}
    </ul>
  )
}

function PaymentMixBlock({ data }: { data: ReportsDashboardData }) {
  const { payment } = data
  const chartData = [
    { name: 'PIX', value: payment.pix, fill: '#25D366' },
    { name: 'Cartão', value: payment.card, fill: '#2563eb' },
    { name: 'Dinheiro', value: payment.cash, fill: '#d97706' },
    { name: 'Outros', value: payment.other, fill: '#9ca3af' },
  ].filter((x) => x.value > 0)

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-base font-bold text-[#1a1614] md:text-lg">Mix de pagamentos</h2>
      <p className="mt-1 text-xs text-[#6b7280]">
        Faturamento nos últimos 30 dias por método (quando registado no pedido). PIX ≈{' '}
        <strong>{payment.pixPct}%</strong> do total.
      </p>
      {chartData.length === 0 ? (
        <p className="mt-6 text-sm text-[#9ca3af]">Sem dados de método de pagamento.</p>
      ) : (
        <div className="mt-6 h-[200px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis
                type="category"
                dataKey="name"
                width={72}
                tick={{ fontSize: 12, fill: '#374151' }}
              />
              <Tooltip
                formatter={(value) =>
                  money.format(Number(value ?? 0))
                }
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
              />
              <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                {chartData.map((e, i) => (
                  <Cell key={i} fill={e.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function FinanceBlock({ data }: { data: ReportsDashboardData }) {
  const { finance } = data
  const periods = [
    ['Hoje', finance.today],
    ['7 dias', finance.d7],
    ['30 dias', finance.d30],
  ] as const

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-[#1a1614] md:text-lg">Financeiro do Caixa</h2>
          <p className="mt-1 text-xs text-[#6b7280]">
            Receitas, despesas, saldo operacional e contas pendentes cadastradas na aba Financeiro.
          </p>
        </div>
        <span className="rounded-full bg-[#f3f4f6] px-3 py-1 text-xs font-bold text-[#374151]">
          Pendentes: {money.format(finance.allPending)}
        </span>
      </div>

      {finance.missingTable ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Aplica a migração{' '}
          <code className="rounded bg-amber-100 px-1">
            supabase/migrations/20260725190016_financeiro_schema.sql
          </code>{' '}
          no Supabase para exibir lançamentos e fornecedores.
        </p>
      ) : !finance.hasData ? (
        <p className="mt-4 text-sm text-[#9ca3af]">Sem lançamentos financeiros cadastrados ainda.</p>
      ) : (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {periods.map(([label, summary]) => (
              <div key={label} className="rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">{label}</p>
                <div className="mt-3 space-y-1.5 text-sm text-[#374151]">
                  <div className="flex justify-between gap-3">
                    <span>Receitas</span>
                    <span className="font-semibold tabular-nums text-emerald-700">
                      {money.format(summary.receitas)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Despesas</span>
                    <span className="font-semibold tabular-nums text-red-600">
                      {money.format(summary.despesas)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-[var(--card-border)] pt-2">
                    <span>Saldo</span>
                    <span
                      className={`font-bold tabular-nums ${
                        summary.saldo >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {money.format(summary.saldo)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 text-xs text-[#6b7280]">
                    <span>Contas pendentes</span>
                    <span className="font-semibold tabular-nums">
                      {money.format(summary.contasPendentes)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--card-border)] bg-white p-4">
              <h3 className="text-sm font-bold text-[#1a1614]">Fornecedores com pendência</h3>
              {finance.topPendingSuppliers.length === 0 ? (
                <p className="mt-3 text-xs text-[#9ca3af]">Nenhuma conta pendente por fornecedor.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {finance.topPendingSuppliers.map((supplier) => (
                    <li
                      key={`${supplier.nome}-${supplier.contasPendentes}`}
                      className="flex justify-between gap-3 border-b border-[var(--card-border)] pb-2 text-sm last:border-0 last:pb-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[#374151]">{supplier.nome}</span>
                        <span className="text-xs text-[#9ca3af]">{supplier.categoria ?? 'Sem categoria'}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-[#1a1614]">
                        {money.format(supplier.contasPendentes)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-[var(--card-border)] bg-white p-4">
              <h3 className="text-sm font-bold text-[#1a1614]">Últimos lançamentos</h3>
              {finance.recentEntries.length === 0 ? (
                <p className="mt-3 text-xs text-[#9ca3af]">Sem lançamentos recentes.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {finance.recentEntries.map((entry, i) => (
                    <li
                      key={`${entry.dateKey}-${entry.descricao}-${i}`}
                      className="flex justify-between gap-3 border-b border-[var(--card-border)] pb-2 text-sm last:border-0 last:pb-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[#374151]">
                          {entry.descricao}
                        </span>
                        <span className="text-xs text-[#9ca3af]">
                          {dateLabel(entry.dateKey)} · {entry.categoria}
                          {entry.fornecedor ? ` · ${entry.fornecedor}` : ''}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 font-semibold tabular-nums ${
                          entry.tipo === 'receita' ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {entry.tipo === 'despesa' ? '− ' : ''}
                        {money.format(entry.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function PerformanceBlock({ data }: { data: ReportsDashboardData }) {
  const [range, setRange] = useState<PerfRange>('7d')

  const series = useMemo((): ReportSeriesPoint[] => {
    if (range === 'today') return data.performance.today
    if (range === '7d') return data.performance.d7
    return data.performance.d30
  }, [range, data.performance])

  const tabs: { id: PerfRange; label: string }[] = [
    { id: 'today', label: 'Hoje' },
    { id: '7d', label: '7 dias' },
    { id: '30d', label: '30 dias' },
  ]

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-[#1a1614] md:text-lg">
            Performance geral
          </h2>
          <p className="mt-1 text-xs text-[#6b7280]">
            Faturamento e n.º de pedidos (Brasília)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setRange(t.id)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold sm:text-sm ${
                range === t.id
                  ? 'bg-[var(--dash-primary)] text-white shadow-sm'
                  : 'border border-[var(--card-border)] bg-white text-[#374151] hover:bg-[#f9fafb]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 h-[280px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              interval={range === '30d' ? 4 : 0}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={(v) =>
                typeof v === 'number' && v >= 1000
                  ? `${(v / 1000).toFixed(1)}k`
                  : String(v)
              }
              width={44}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              width={36}
            />
            <Tooltip
              formatter={(value, name) =>
                name === 'Faturamento'
                  ? money.format(Number(value ?? 0) || 0)
                  : String(value ?? 0)
              }
              contentStyle={{
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                fontSize: 13,
              }}
            />
            <Legend />
            <Bar
              yAxisId="right"
              dataKey="orders"
              name="Pedidos"
              fill="#cbd5e1"
              radius={[4, 4, 0, 0]}
              maxBarSize={range === 'today' ? 16 : 28}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="revenue"
              name="Faturamento"
              stroke="#ea580c"
              strokeWidth={2}
              dot={{ r: range === 'today' ? 3 : 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function TicketBlock({ data }: { data: ReportsDashboardData }) {
  const { ticket } = data
  const pct = ticket.pctChangeVsPrev7d
  const up = pct != null && pct > 0
  const down = pct != null && pct < 0

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-base font-bold text-[#1a1614] md:text-lg">Ticket médio</h2>
      <p className="mt-1 text-xs text-[#6b7280]">Média dos últimos 7 dias vs 7 anteriores</p>
      <div className="mt-4 flex flex-wrap items-end gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Atual (7d)
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-[#1a1614]">
            {money.format(ticket.avgCurrent7d)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-[#6b7280]">Variação</p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums ${
              down ? 'text-red-600' : up ? 'text-emerald-700' : 'text-[#6b7280]'
            }`}
          >
            {pct == null ? '—' : `${up ? '+' : ''}${pct}%`}
          </p>
        </div>
      </div>
      <div className="mt-5 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
        <span className="font-semibold text-amber-950">Projeção: </span>
        Se aumentares <strong>R$ 5,00</strong> no ticket em cada pedido, à taxa recente
        ({ticket.ordersLast7d} pedidos / 7 dias), o impacto aproximado é{' '}
        <strong>+{money.format(ticket.projectedMonthlyGainIfTicketPlus5)}</strong> por mês
        (projeção linear, não cancelados).
      </div>
    </section>
  )
}

function HoursBlock({ data }: { data: ReportsDashboardData }) {
  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-base font-bold text-[#1a1614] md:text-lg">
        Horários que mais vendem
      </h2>
      <p className="mt-1 text-xs text-[#6b7280]">
        Pedidos por hora (Brasília, ~últimos 40 dias). Pico:{' '}
        <strong>{data.peakRangeLabel}</strong>
        {data.deadHourLabel ? (
          <>
            {' '}
            · Mais calmo: <strong>{data.deadHourLabel}</strong>
          </>
        ) : null}
      </p>
      <div className="mt-6 h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.hours} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#6b7280' }} interval={2} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} width={32} />
            <Tooltip
              formatter={(v) => [String(v ?? 0), 'Pedidos']}
              contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
            />
            <Bar dataKey="orders" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.deadHourLabel ? (
        <p className="mt-4 text-sm text-[#6b7280]">
          <span className="font-semibold text-[#374151]">Insight: </span>
          Baixo movimento às {data.deadHourLabel} — horário ideal para promoção pontual ou anúncio.
        </p>
      ) : null}
    </section>
  )
}

function ProductCol({
  title,
  rows,
  hint,
}: {
  title: string
  rows: { name: string; quantity: number; revenue: number; price?: number }[]
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-4">
      <h3 className="text-sm font-bold text-[#1a1614]">{title}</h3>
      {hint ? <p className="mt-1 text-xs text-[#6b7280]">{hint}</p> : null}
      <ul className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <li className="text-xs text-[#9ca3af]">Sem dados.</li>
        ) : (
          rows.map((r, i) => (
            <li
              key={i}
              className="flex justify-between gap-2 border-b border-[var(--card-border)] pb-2 text-sm last:border-0 last:pb-0"
            >
              <span className="min-w-0 truncate font-medium text-[#374151]">{r.name}</span>
              <span className="shrink-0 text-xs text-[#6b7280]">
                {r.quantity} u · {money.format(r.revenue)}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

function ProductsBlock({ data }: { data: ReportsDashboardData }) {
  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-base font-bold text-[#1a1614] md:text-lg">Produtos inteligentes</h2>
      <p className="mt-1 text-xs text-[#6b7280]">
        Baseado em linhas de pedido. “Lucro” real precisa de custo — aqui usamos{' '}
        <strong>maior faturamento</strong>.
      </p>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <ProductCol title="Mais vendidos" rows={data.products.topByQty} />
        <ProductCol
          title="Maior faturamento"
          rows={data.products.topByRevenue}
          hint="Receita no período"
        />
        <ProductCol
          title="Pouco vendidos (com preço visível)"
          rows={data.products.slowMovers}
          hint="Candidatos a promoção ou reposicionamento"
        />
      </div>
      {data.products.slowMovers[0] ? (
        <p className="mt-4 text-sm text-[#6b7280]">
          <span className="font-semibold text-[#374151]">Insight: </span>“
          {data.products.slowMovers[0].name}” vende pouco — se o preço for alto, pode ter
          margem para campanha.
        </p>
      ) : null}
    </section>
  )
}

function PromoBlock({ data }: { data: ReportsDashboardData }) {
  const p = data.promo
  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-base font-bold text-[#1a1614] md:text-lg">Impacto de promoções</h2>
      <p className="mt-1 text-xs text-[#6b7280]">
        Aproximação: produtos <strong>marcados como promoção no cardápio hoje</strong> nas linhas
        de pedido do período (não é histórico exato de preço).
      </p>
      {!p ? (
        <p className="mt-4 text-sm text-[#9ca3af]">Sem linhas de itens no período.</p>
      ) : (
        <ul className="mt-4 space-y-2 text-sm text-[#374151]">
          <li>
            <strong>{p.ordersWithPromoLine}</strong> pedidos com pelo menos um item em promoção
            (SKU atual).
          </li>
          <li>
            <strong>{p.promoSharePct}%</strong> das unidades vendidas em linhas “promo” (aprox.).
          </li>
        </ul>
      )}
      <p className="mt-4 text-sm text-[var(--dash-primary)]">
        Liga com a aba <strong>Promoções</strong> para criar campanhas guiadas.
      </p>
    </section>
  )
}

function ConversionBlock() {
  return (
    <section className="rounded-2xl border border-dashed border-[var(--card-border)] bg-[#fafafa] p-5 md:p-6">
      <h2 className="text-base font-bold text-[#1a1614] md:text-lg">Conversão</h2>
      <p className="mt-2 text-sm text-[#6b7280]">
        Visitas → pedidos e abandono ainda não estão ligados ao cardápio público. Quando
        integrarmos analytics de visitas, este bloco mostra taxa de conversão e onde perdes
        clientes antes de finalizar.
      </p>
    </section>
  )
}

function Rolling30Block({
  advanced,
}: {
  advanced: NonNullable<ReportsDashboardData['advanced']>
}) {
  const a = advanced.rolling30VsPrior30
  const pct = a.revenuePctChange
  const up = pct != null && pct > 0
  const down = pct != null && pct < 0

  return (
    <section className="rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50/80 to-white p-5 shadow-sm md:p-6">
      <h2 className="text-base font-bold text-violet-950 md:text-lg">
        Comparativo 30 vs 30 dias
      </h2>
      <p className="mt-1 text-xs text-violet-900/80">
        Últimos 30 dias corridos face aos 30 dias anteriores (Brasília). Incluído no plano
        Pro.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-violet-100 bg-white/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Faturamento
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[#1a1614]">
            {money.format(a.revenueCurrent)}
          </p>
          <p className="mt-1 text-xs text-[#6b7280]">
            Período anterior: {money.format(a.revenuePrevious)}
          </p>
          <p
            className={`mt-2 text-sm font-bold tabular-nums ${
              down ? 'text-red-600' : up ? 'text-emerald-700' : 'text-[#6b7280]'
            }`}
          >
            {pct == null ? 'Variação —' : `${up ? '+' : ''}${pct}%`}
          </p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-white/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Pedidos
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[#1a1614]">
            {a.ordersCurrent}
          </p>
          <p className="mt-1 text-xs text-[#6b7280]">
            Período anterior: {a.ordersPrevious}
          </p>
        </div>
      </div>
    </section>
  )
}

function RecommendationsBlock({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <section className="rounded-2xl border-2 border-violet-200/90 bg-gradient-to-br from-violet-50/90 via-white to-amber-50/30 p-5 shadow-sm md:p-6">
      <h2 className="text-base font-bold text-violet-900 md:text-lg">
        Recomendações do sistema
      </h2>
      <p className="mt-1 text-xs text-violet-800/90">
        Sugestões acionáveis — não só números.
      </p>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-[#374151]">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ol>
    </section>
  )
}

export function ReportsDashboardClient({
  data,
  reportsAdvanced,
  canExportPdf,
}: {
  data: ReportsDashboardData
  reportsAdvanced: boolean
  canExportPdf: boolean
}) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1a1614] md:text-3xl">
            Relatórios
          </h1>
          <p className="mt-1 text-sm text-[#6b7280]">
            Análises e insights do teu negócio.
            {reportsAdvanced ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-900">
                Avançado (Pro)
              </span>
            ) : null}
          </p>
        </div>
        <ReportsExportButton data={data} allowExport={canExportPdf} />
      </header>

      {data.missingOrdersSchema ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Schema de pedidos incompleto para relatórios. Aplica{' '}
          <code className="rounded bg-amber-100 px-1">
            supabase/migrations/20260725190009_relatorios_schema.sql
          </code>{' '}
          no Supabase.
        </div>
      ) : null}

      {!data.hasEnoughData ? (
        <>
          <div className="rounded-2xl border border-dashed border-[var(--card-border)] bg-white px-6 py-14 text-center text-sm text-[#6b7280]">
            {data.missingOrdersSchema
              ? 'Não foi possível carregar pedidos para os relatórios. Verifica a migração acima.'
              : (
                <>
                  Ainda há poucos pedidos para gerar relatórios. Com pelo menos{' '}
                  <strong>3 pedidos</strong> nos últimos dias, aparecem gráficos e insights aqui.
                </>
              )}
          </div>
          <FinanceBlock data={data} />
        </>
      ) : (
        <>
          <section>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#6b7280]">
              Insights automáticos
            </h2>
            <InsightList items={data.insights} />
          </section>

          <PerformanceBlock data={data} />

          {data.advanced ? <Rolling30Block advanced={data.advanced} /> : null}

          <PaymentMixBlock data={data} />

          <FinanceBlock data={data} />

          <div className="grid gap-5 lg:grid-cols-2">
            <TicketBlock data={data} />
            <HoursBlock data={data} />
          </div>

          <ProductsBlock data={data} />

          <div className="grid gap-5 lg:grid-cols-2">
            <PromoBlock data={data} />
            <ConversionBlock />
          </div>

          <RecommendationsBlock items={data.recommendations} />
        </>
      )}
    </div>
  )
}
