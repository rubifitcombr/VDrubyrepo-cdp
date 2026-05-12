import Link from 'next/link'
import { headers } from 'next/headers'
import {
  IconClipboard,
  IconClock,
  IconCurrency,
  IconTrendUp,
} from './_components/NavIcons'
import { DashboardOperationCard } from './_components/DashboardOperationCard'
import { DashboardStoreControls } from './_components/DashboardStoreControls'
import { hasActivePromotion } from '@/lib/product-pricing'
import { getUser } from '@/services/auth.server'
import {
  getDashboardHomeData,
  type DashboardProductSignalRow,
  type DashboardRecentOrderRow,
} from '@/services/dashboard.server'
import { getStoreByUser } from '@/services/store.server'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function buildDashboardAlerts(rows: DashboardProductSignalRow[]): string[] {
  const n = rows.length
  const alerts: string[] = []
  if (n === 0) {
    alerts.push('Cardápio sem produtos ativos — adiciona itens em Produtos.')
    return alerts
  }
  if (n < 5) {
    alerts.push('Poucos produtos no cardápio — considera ampliar o menu.')
  }
  let noImg = 0
  let withPromo = 0
  for (const p of rows) {
    if (!p.image_url?.trim()) noImg++
    if (hasActivePromotion(p)) withPromo++
  }
  if (noImg > 0) {
    alerts.push(
      `${noImg} produto(s) sem imagem — fotos ajudam a vender mais.`
    )
  }
  if (withPromo === 0) {
    alerts.push(
      'Nenhuma promoção ativa — podes destacar ofertas nos produtos.'
    )
  }
  return alerts
}

function orderStatusLabel(s: string | null | undefined) {
  switch (s) {
    case 'pending':
      return 'Pendente'
    case 'preparing':
      return 'A preparar'
    case 'ready':
      return 'Pronto p/ envio'
    case 'delivered':
      return 'Entregue'
    case 'confirmed':
      return 'A caminho'
    default:
      return s?.trim() || '—'
  }
}

function statusBadgeClass(s: string | null | undefined) {
  switch (s) {
    case 'pending':
      return 'bg-red-50 text-red-700 ring-red-200'
    case 'preparing':
      return 'bg-orange-50 text-[var(--dash-primary)] ring-orange-200'
    case 'ready':
      return 'bg-violet-50 text-violet-900 ring-violet-200'
    case 'confirmed':
      return 'bg-sky-50 text-sky-900 ring-sky-200'
    case 'delivered':
      return 'bg-white text-[#374151] ring-[var(--card-border)]'
    default:
      return 'bg-[#f3f4f6] text-[#6b7280] ring-[var(--card-border)]'
  }
}

function customerInitials(name: string | null | undefined): string {
  const t = name?.trim()
  if (!t) return 'CL'
  const p = t.split(/\s+/).filter(Boolean)
  if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase().slice(0, 2)
  return t.slice(0, 2).toUpperCase()
}

function formatPctVsPrevious(current: number, previous: number): string | null {
  if (previous <= 0) {
    if (current <= 0) return null
    return 'Novo vs mês anterior'
  }
  const p = Math.round(((current - previous) / previous) * 100)
  if (p > 0) return `+${p}% vs mês anterior`
  if (p < 0) return `${p}% vs mês anterior`
  return 'Igual ao mês anterior'
}

function formatDayOverDay(
  current: number,
  previous: number,
  suffix: string
): string | null {
  if (previous <= 0) {
    if (current <= 0) return null
    return `Novo ${suffix}`
  }
  const p = Math.round(((current - previous) / previous) * 100)
  if (p > 0) return `+${p}% ${suffix}`
  if (p < 0) return `${p}% ${suffix}`
  return `0% ${suffix}`
}

export default async function Dashboard() {
  const user = await getUser()

  if (!user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Sessão necessária
        </h1>
        <p className="mt-2 text-sm text-vyria-navy-muted">
          Inicia sessão para veres o teu painel.
        </p>
        <Link
          href="/login"
          className="btn-vyria-gradient mt-8 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Ir para login
        </Link>
      </div>
    )
  }

  const store = await getStoreByUser(user.id)
  const storeId =
    store && typeof store === 'object' && 'id' in store
      ? (store.id as string)
      : null

  const storeSlug =
    store && typeof store === 'object' && 'slug' in store && store.slug
      ? String(store.slug)
      : null

  const manualClosedRaw = (store as { manual_closed?: boolean | null } | null)
    ?.manual_closed
  const initialManualClosed = manualClosedRaw === true

  const st = store as Record<string, unknown> | null

  function moneyInput(v: unknown): string {
    if (v == null || v === '') return ''
    const n = Number(v)
    return !Number.isNaN(n) ? String(n).replace('.', ',') : ''
  }

  const deliveryFeeInitial = moneyInput(st?.delivery_fee)
  const deliveryFreeAboveInitial = moneyInput(st?.delivery_free_above)

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const origin = host ? `${proto}://${host}` : ''

  const homeData = storeId ? await getDashboardHomeData(storeId) : null
  const alerts = homeData ? buildDashboardAlerts(homeData.activeProducts) : []
  const ov = homeData?.overview

  const avgYesterday =
    ov && ov.ordersYesterday > 0
      ? ov.revenueYesterday / ov.ordersYesterday
      : 0
  const ticketDayDelta =
    ov && avgYesterday > 0 && ov.avgTicketToday > 0
      ? formatDayOverDay(ov.avgTicketToday, avgYesterday, 'vs ontem')
      : ov && ov.avgTicketToday > 0
        ? '—'
        : null

  const monthPct = ov
    ? formatPctVsPrevious(ov.monthRevenue, ov.prevMonthRevenue)
    : null

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 xl:max-w-none">
      <div>
        <h1 className="font-brand text-2xl font-bold tracking-tight text-[#1a1614] md:text-3xl">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Visão geral do teu negócio.
        </p>
      </div>

      {alerts.length > 0 && storeId ? (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 shadow-sm">
          <p className="font-semibold text-amber-900">Avisos</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-amber-900/90">
            {alerts.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {storeId && ov ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                    Pedidos hoje
                  </p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-[#1a1614]">
                    {ov.ordersToday}
                  </p>
                  {formatDayOverDay(
                    ov.ordersToday,
                    ov.ordersYesterday,
                    'vs ontem'
                  ) ? (
                    <p className="mt-1 text-xs font-medium text-[var(--dash-success)]">
                      {formatDayOverDay(
                        ov.ordersToday,
                        ov.ordersYesterday,
                        'vs ontem'
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-[#9ca3af]">—</p>
                  )}
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <IconClipboard className="h-6 w-6" />
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                    Faturamento hoje
                  </p>
                  <p className="mt-2 truncate text-2xl font-bold tabular-nums text-[#1a1614] sm:text-3xl">
                    {money.format(ov.revenueToday)}
                  </p>
                  {formatDayOverDay(
                    ov.revenueToday,
                    ov.revenueYesterday,
                    'vs ontem'
                  ) ? (
                    <p className="mt-1 text-xs font-medium text-[var(--dash-success)]">
                      {formatDayOverDay(
                        ov.revenueToday,
                        ov.revenueYesterday,
                        'vs ontem'
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-[#9ca3af]">—</p>
                  )}
                </div>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <IconCurrency className="h-6 w-6" />
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                    Pedidos pendentes
                  </p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-[#1a1614]">
                    {ov.pendingOrders}
                  </p>
                  <p className="mt-1 text-xs text-[#9ca3af]">
                    Aguardam confirmação
                  </p>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-[var(--dash-primary)]">
                  <IconClock className="h-6 w-6" />
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                    Ticket médio hoje
                  </p>
                  <p className="mt-2 truncate text-2xl font-bold tabular-nums text-[#1a1614] sm:text-3xl">
                    {money.format(ov.avgTicketToday)}
                  </p>
                  {ticketDayDelta && ticketDayDelta !== '—' ? (
                    <p className="mt-1 text-xs font-medium text-[var(--dash-success)]">
                      {ticketDayDelta}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-[#9ca3af]">—</p>
                  )}
                </div>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
                  <IconTrendUp className="h-6 w-6" />
                </span>
              </div>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04] md:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-[#1a1614]">
                  Pedidos recentes
                </h2>
                <Link
                  href="/dashboard/orders"
                  className="text-sm font-semibold text-[var(--dash-primary)] hover:underline"
                >
                  Ver todos
                </Link>
              </div>
              {ov.recentOrders.length === 0 ? (
                <p className="mt-8 pb-4 text-center text-sm text-[#6b7280]">
                  Nenhum pedido ainda.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-[var(--card-border)]">
                  {ov.recentOrders.map((o: DashboardRecentOrderRow) => (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-center gap-3 py-3 first:pt-0"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-xs font-bold text-[#374151]">
                        {customerInitials(o.customer_name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#1a1614]">
                          {o.customer_name?.trim() || 'Cliente'}
                        </p>
                        <p className="truncate text-xs text-[#6b7280]">
                          Pedido · {dateTime.format(new Date(o.created_at))}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${statusBadgeClass(o.status)}`}
                      >
                        {orderStatusLabel(o.status)}
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-[#1a1614]">
                        {money.format(Number(o.total) || 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04] md:p-6">
              <h2 className="text-base font-bold text-[#1a1614]">
                Mais vendidos
              </h2>
              {ov.topProducts.length === 0 ? (
                <p className="mt-6 text-center text-sm text-[#6b7280]">
                  Nenhum dado ainda.
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {(() => {
                    const maxQ = Math.max(
                      ...ov.topProducts.map((p) => p.quantity),
                      1
                    )
                    return ov.topProducts.map((p, i) => (
                      <li key={`${p.name}-${i}`}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate font-medium text-[#1a1614]">
                            <span className="mr-2 tabular-nums text-[#9ca3af]">
                              {i + 1}.
                            </span>
                            {p.name}
                          </span>
                          <span className="shrink-0 tabular-nums font-semibold text-[#1a1614]">
                            {p.quantity}
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f3f4f6]">
                          <div
                            className="h-full rounded-full bg-[var(--dash-primary)] transition-[width] duration-500"
                            style={{
                              width: `${Math.round((p.quantity / maxQ) * 100)}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))
                  })()}
                </ul>
              )}
            </section>
          </div>

          <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04] md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                  Faturamento do mês
                </p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-[#1a1614] md:text-4xl">
                  {money.format(ov.monthRevenue)}
                </p>
              </div>
              {monthPct ? (
                <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-[var(--dash-success)] ring-1 ring-emerald-200/80">
                  {monthPct}
                </span>
              ) : (
                <span className="text-sm text-[#9ca3af]">—</span>
              )}
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--card-border)] bg-white p-8 text-center text-sm text-[#6b7280] shadow-sm">
          Cria uma loja para veres métricas e pedidos.
        </div>
      )}

      {storeId ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <DashboardStoreControls storeSlug={storeSlug} origin={origin} />
          <DashboardOperationCard
            key={`${storeId}-${initialManualClosed}-${deliveryFeeInitial}-${deliveryFreeAboveInitial}`}
            storeId={storeId}
            initialManualClosed={initialManualClosed}
            initialDeliveryFee={deliveryFeeInitial}
            initialDeliveryFreeAbove={deliveryFreeAboveInitial}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--card-border)] bg-white p-5 text-sm text-[#6b7280] shadow-sm">
          Associa uma loja à conta para veres métricas, link público e funcionamento (loja aberta e
          taxas de entrega).
        </div>
      )}
    </div>
  )
}
