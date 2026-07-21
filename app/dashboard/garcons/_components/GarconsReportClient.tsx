'use client'

import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import type { GarconsReportDTO } from '@/lib/garcons-report-types'
import { defaultGarconsReportRange } from '@/lib/garcons-report-dates'
import { useEffect, useMemo, useState } from 'react'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function brDate(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y.slice(-2)}`
}

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#eff6ff] text-[var(--dash-primary)]">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-lg font-bold text-[#1a1614]">{value}</p>
          <p className="text-xs font-medium text-[#6b7280]">{label}</p>
        </div>
      </div>
    </div>
  )
}

export function GarconsReportClient({ pinsConfigured }: { pinsConfigured: boolean }) {
  const defaults = useMemo(() => defaultGarconsReportRange(), [])
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [report, setReport] = useState<GarconsReportDTO | null>(null)
  const [loading, setLoading] = useState(pinsConfigured)

  useEffect(() => {
    if (!pinsConfigured) {
      setReport(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true)
        try {
          const qs = new URLSearchParams({ from, to })
          const res = await dashboardFetch(`/api/store/garcons/report?${qs}`)
          const json = (await res.json().catch(() => ({}))) as {
            report?: GarconsReportDTO
            pinsNotConfigured?: boolean
          }
          if (cancelled) return
          if (json.pinsNotConfigured) {
            setReport(null)
            return
          }
          setReport(json.report ?? null)
        } catch {
          if (!cancelled) setReport(null)
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [from, to, pinsConfigured])

  const summary = report?.summary

  if (!pinsConfigured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-8 text-center sm:px-6">
        <p className="text-sm font-semibold text-amber-950">
          Relatório indisponível sem PIN configurado
        </p>
        <p className="mx-auto mt-2 max-w-lg text-sm text-amber-900">
          Ative e defina o PIN de 4 dígitos de cada garçom na aba{' '}
          <span className="font-semibold">Meus garçons</span>. O relatório e a filtragem no
          mapa de mesas usam o PIN para identificar quem atendeu cada comanda.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3.5 sm:px-5">
        <div className="flex gap-3">
          <svg
            className="mt-0.5 h-5 w-5 shrink-0 text-[#2563eb]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-[#1e40af]">
            Este relatório mostra as vendas registradas pelo modo garçom no salão. Filtre
            por período para ver faturamento, ticket médio e taxa de serviço por garçom.
          </p>
        </div>
      </div>

      {report?.missingColumns ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Colunas de garçom em pedidos ainda não existem. Executa{' '}
          <code className="rounded bg-amber-100 px-1">supabase/garcons-orders.sql</code> no
          Supabase.
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            De
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Até
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
          />
        </div>
        <p className="text-sm text-[#6b7280] sm:pb-2">
          {brDate(from)} – {brDate(to)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Faturamento"
          value={money.format(summary?.faturamento ?? 0)}
          icon={<span className="text-base font-bold">$</span>}
        />
        <KpiCard
          label="Ticket médio"
          value={money.format(summary?.ticket_medio ?? 0)}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          }
        />
        <KpiCard
          label="Total de pedidos"
          value={String(summary?.total_pedidos ?? 0)}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <KpiCard
          label="Taxa de serviço"
          value={money.format(summary?.taxa_servico ?? 0)}
          icon={<span className="text-base font-bold">%</span>}
        />
        <KpiCard
          label="Garçons ativos"
          value={String(summary?.garcons_ativos ?? 0)}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        />
      </div>

      <div className="rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
        <div className="border-b border-[#e5e7eb] px-4 py-3 sm:px-5">
          <p className="text-sm text-[#6b7280]">
            Total de{' '}
            <span className="font-semibold text-[#374151]">
              {report?.rows.length ?? 0}
            </span>{' '}
            registros
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-[#f9fafb] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                <th className="px-4 py-3 sm:px-5">Nome</th>
                <th className="px-4 py-3">Total pedidos</th>
                <th className="px-4 py-3">Valor pedidos</th>
                <th className="px-4 py-3">Ticket médio</th>
                <th className="px-4 py-3 sm:px-5">Taxa de serviço</th>
              </tr>
            </thead>
            <tbody>
              {loading && !report ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[#6b7280]">
                    A carregar…
                  </td>
                </tr>
              ) : !report?.rows.length ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[#6b7280]">
                    Nenhum pedido fechado pelo garçom neste período.
                  </td>
                </tr>
              ) : (
                report.rows.map((row) => (
                  <tr
                    key={row.garcom_id ?? `sem-${row.nome}`}
                    className="border-b border-[#f3f4f6] hover:bg-[#fafafa]"
                  >
                    <td className="px-4 py-3.5 font-medium capitalize text-[#1a1614] sm:px-5">
                      {row.nome}
                    </td>
                    <td className="px-4 py-3.5 text-[#374151]">{row.total_pedidos}</td>
                    <td className="px-4 py-3.5 text-[#374151]">
                      {money.format(row.valor_pedidos)}
                    </td>
                    <td className="px-4 py-3.5 text-[#374151]">
                      {money.format(row.ticket_medio)}
                    </td>
                    <td className="px-4 py-3.5 text-[#374151] sm:px-5">
                      {money.format(row.taxa_servico)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
