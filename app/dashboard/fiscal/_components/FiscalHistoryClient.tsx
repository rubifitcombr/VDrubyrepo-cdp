'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FiscalInvoiceStatus, FiscalInvoiceTone } from '@/lib/fiscal'
import {
  FISCAL_INVOICE_STATUS_LABEL,
  NFCE_CANCEL_JUSTIFICATIVA_MIN,
  nfceCancelPrazoLabel,
} from '@/lib/fiscal'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'

type HistoryInvoice = {
  id: string
  orderId: string | null
  customerName: string | null
  status: FiscalInvoiceStatus
  statusLabel: string
  tone: FiscalInvoiceTone
  sefazMessage: string
  ambiente: string | null
  chaveAcesso: string | null
  protocolo: string | null
  valorTotal: number | null
  emitidaEm: string | null
  canceladaEm: string | null
  createdAt: string | null
  nfeUrl: string | null
  xmlUrl: string | null
  qrCodeUrl: string | null
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

const STATUS_FILTERS: Array<{ id: '' | FiscalInvoiceStatus; label: string }> = [
  { id: '', label: 'Todas' },
  { id: 'autorizada', label: 'Autorizadas' },
  { id: 'rejeitada', label: 'Rejeitadas' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'cancelada', label: 'Canceladas' },
  { id: 'erro', label: 'Erros' },
]

function ToneDot({ tone }: { tone: FiscalInvoiceTone }) {
  const cls =
    tone === 'green'
      ? 'bg-emerald-500 ring-emerald-200'
      : tone === 'red'
        ? 'bg-rose-500 ring-rose-200'
        : tone === 'amber'
          ? 'bg-amber-400 ring-amber-200'
          : 'bg-slate-400 ring-slate-200'
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${cls}`}
      aria-hidden
    />
  )
}

function toneBadgeClass(tone: FiscalInvoiceTone): string {
  if (tone === 'green') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (tone === 'red') return 'border-rose-200 bg-rose-50 text-rose-800'
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-900'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function shortChave(chave: string | null): string {
  if (!chave) return '—'
  const d = chave.replace(/\D/g, '')
  if (d.length < 8) return chave
  return `…${d.slice(-8)}`
}

function shortOrder(orderId: string | null): string {
  if (!orderId) return '—'
  return `#${orderId.replace(/-/g, '').slice(0, 8)}`
}

export function FiscalHistoryClient({
  storeId,
  compact = false,
}: {
  storeId: string
  /** Lista reduzida para embutir no painel principal. */
  compact?: boolean
}) {
  const [invoices, setInvoices] = useState<HistoryInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'' | FiscalInvoiceStatus>('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const limit = compact ? 8 : 100

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({
        storeId,
        limit: String(limit),
      })
      if (statusFilter) qs.set('status', statusFilter)
      const res = await dashboardFetch(`/api/store/fiscal/invoices?${qs}`)
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        invoices?: HistoryInvoice[]
      }
      if (!res.ok) {
        setError(json.error || 'Não foi possível carregar o histórico.')
        setInvoices([])
        return
      }
      setInvoices(Array.isArray(json.invoices) ? json.invoices : [])
    } catch {
      setError('Erro de rede ao carregar o histórico.')
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [storeId, limit, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const c = { ok: 0, bad: 0, pending: 0 }
    for (const inv of invoices) {
      if (inv.tone === 'green') c.ok += 1
      else if (inv.tone === 'red') c.bad += 1
      else if (inv.tone === 'amber') c.pending += 1
    }
    return c
  }, [invoices])


  async function consultarSefaz(inv: HistoryInvoice) {
    setBusyId(inv.id)
    setActionMsg(null)
    try {
      const res = await dashboardFetch('/api/store/fiscal/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: inv.id }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        status?: FiscalInvoiceStatus
        statusLabel?: string
        tone?: FiscalInvoiceTone
        sefazMessage?: string
        chaveAcesso?: string | null
        nfeUrl?: string | null
        xmlUrl?: string | null
        qrCodeUrl?: string | null
      }
      if (!res.ok) {
        setActionMsg(json.error || 'Falha ao consultar a SEFAZ.')
        return
      }
      setInvoices((prev) =>
        prev.map((row) =>
          row.id === inv.id
            ? {
                ...row,
                status: json.status || row.status,
                statusLabel: json.statusLabel || row.statusLabel,
                tone: json.tone || row.tone,
                sefazMessage: json.sefazMessage || row.sefazMessage,
                chaveAcesso: json.chaveAcesso ?? row.chaveAcesso,
                nfeUrl: json.nfeUrl ?? row.nfeUrl,
                xmlUrl: json.xmlUrl ?? row.xmlUrl,
                qrCodeUrl: json.qrCodeUrl ?? row.qrCodeUrl,
              }
            : row
        )
      )
      setActionMsg(`SEFAZ: ${json.sefazMessage || json.statusLabel || 'atualizado'}`)
    } finally {
      setBusyId(null)
    }
  }

  async function cancelarNota(inv: HistoryInvoice) {
    if (inv.status !== 'autorizada') return
    const prazo = nfceCancelPrazoLabel({
      status: inv.status,
      emitida_em: inv.emitidaEm,
    })
    const input = window.prompt(
      `Cancelar NFC-e ${shortOrder(inv.orderId)}.\n\n${prazo}\n\nJustificativa (mín. ${NFCE_CANCEL_JUSTIFICATIVA_MIN} caracteres):`,
      'Cancelamento do pedido pelo lojista.'
    )
    if (input === null) return
    const justificativa = input.trim()
    if (justificativa.length < NFCE_CANCEL_JUSTIFICATIVA_MIN) {
      setActionMsg(`Justificativa deve ter no mínimo ${NFCE_CANCEL_JUSTIFICATIVA_MIN} caracteres.`)
      return
    }
    setBusyId(inv.id)
    setActionMsg(null)
    try {
      const res = await dashboardFetch('/api/store/fiscal/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: inv.id, orderId: inv.orderId || undefined, justificativa }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setActionMsg(json.error || 'Não foi possível cancelar a NFC-e.')
        return
      }
      setInvoices((prev) =>
        prev.map((row) =>
          row.id === inv.id
            ? {
                ...row,
                status: 'cancelada',
                statusLabel: FISCAL_INVOICE_STATUS_LABEL.cancelada,
                tone: 'slate',
                sefazMessage: justificativa,
              }
            : row
        )
      )
      setActionMsg('NFC-e cancelada com sucesso.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#1a1614]">
            {compact ? 'Notas recentes' : 'Histórico Fiscal'}
          </h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            Status da SEFAZ nas NFC-e emitidas
            {compact ? ' (últimas emissões).' : '.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!compact ? (
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id || 'all'}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    statusFilter === f.id
                      ? 'border-[var(--dash-primary)] bg-[var(--dash-primary)]/10 text-[var(--dash-primary)]'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? '…' : 'Atualizar'}
          </button>
          {compact ? (
            <Link
              href="/dashboard/fiscal/historico"
              className="rounded-lg border border-[var(--dash-primary)]/25 bg-[var(--dash-primary)]/5 px-2.5 py-1 text-[11px] font-semibold text-[var(--dash-primary)] hover:bg-[var(--dash-primary)]/10"
            >
              Ver tudo
            </Link>
          ) : null}
        </div>
      </div>

      {!compact && !loading && invoices.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#6b7280]">
          <span className="inline-flex items-center gap-1.5">
            <ToneDot tone="green" /> {counts.ok} autorizada{counts.ok === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ToneDot tone="red" /> {counts.bad} rejeitada{counts.bad === 1 ? '' : 's'}/erro
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ToneDot tone="amber" /> {counts.pending} pendente{counts.pending === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      {actionMsg ? (
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {actionMsg}
        </p>
      ) : null}

      {loading && !invoices.length ? (
        <p className="mt-6 text-sm text-[#9ca3af]">A carregar histórico…</p>
      ) : !invoices.length ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-sm text-[#6b7280]">
          Nenhuma NFC-e registada ainda. As notas aparecem aqui após a emissão no PDV, Caixa ou
          Pedidos.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {invoices.map((inv) => (
            <li key={inv.id} className="py-3 first:pt-1 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <ToneDot tone={inv.tone} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${toneBadgeClass(
                          inv.tone
                        )}`}
                      >
                        {inv.statusLabel || FISCAL_INVOICE_STATUS_LABEL[inv.status]}
                      </span>
                      <span className="text-xs font-semibold text-[#1a1614]">
                        {shortOrder(inv.orderId)}
                      </span>
                      {inv.valorTotal != null ? (
                        <span className="text-xs font-semibold tabular-nums text-slate-700">
                          {money.format(inv.valorTotal)}
                        </span>
                      ) : null}
                      {inv.ambiente === 'homologacao' ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                          Homologação
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={`mt-1 text-sm leading-snug ${
                        inv.tone === 'red'
                          ? 'font-medium text-rose-800'
                          : inv.tone === 'green'
                            ? 'text-emerald-900'
                            : 'text-[#374151]'
                      }`}
                    >
                      {inv.sefazMessage}
                    </p>
                    <p className="mt-1 text-[11px] text-[#9ca3af]">
                      {inv.customerName ? `${inv.customerName} · ` : ''}
                      {inv.emitidaEm || inv.createdAt
                        ? dateTime.format(new Date(inv.emitidaEm || inv.createdAt!))
                        : '—'}
                      {' · '}
                      Chave {shortChave(inv.chaveAcesso)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {!compact ? (
                    <button
                      type="button"
                      disabled={busyId === inv.id}
                      onClick={() => void consultarSefaz(inv)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busyId === inv.id ? '…' : 'Consultar SEFAZ'}
                    </button>
                  ) : null}
                  {!compact && inv.status === 'autorizada' ? (
                    <button
                      type="button"
                      disabled={busyId === inv.id}
                      onClick={() => void cancelarNota(inv)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  ) : null}
                  {inv.nfeUrl ? (
                    <a
                      href={inv.nfeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      DANFE
                    </a>
                  ) : null}
                  {inv.xmlUrl ? (
                    <a
                      href={`${inv.xmlUrl}${inv.xmlUrl.includes('?') ? '&' : '?'}download=1`}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                    >
                      XML
                    </a>
                  ) : null}
                  {inv.qrCodeUrl ? (
                    <a
                      href={inv.qrCodeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                    >
                      QR
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
