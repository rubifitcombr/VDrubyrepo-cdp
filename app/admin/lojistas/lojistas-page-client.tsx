'use client'

import Link from 'next/link'
import { ADMIN_PLAN_OPTIONS } from '@/lib/admin-plans'
import type { MerchantStatus } from '@/lib/merchant-status'
import { statusBadgeClass, statusLabel } from '@/lib/merchant-status'
import { planShortLabel, type Plan } from '@/lib/plan'
import { useCallback, useEffect, useState } from 'react'

type LojistaRow = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  plano: Plan
  status: MerchantStatus
  plano_vence_em: string | null
  cadastrado_em: string | null
}

type Metrics = {
  total: number
  ativos: number
  pendentes: number
  bloqueadosCancelados: number
}

const filtros = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'ativo', label: 'Ativos' },
  { id: 'bloqueado', label: 'Bloqueados' },
  { id: 'cancelado', label: 'Cancelados' },
  { id: 'vencendo', label: 'Vencendo em 3 dias' },
] as const

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  return d.toLocaleDateString('pt-BR')
}

function addDaysIso(iso: string | null, days: number): string {
  const d = iso
    ? new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
    : new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
          <h2 id="admin-modal-title" className="text-base font-semibold text-[#1a1614]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl leading-none text-[#6b7280] hover:bg-[#f5f5f5]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}

export function LojistasPageClient() {
  const [filtro, setFiltro] = useState<string>('todos')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [rows, setRows] = useState<LojistaRow[]>([])

  const [ativarOpen, setAtivarOpen] = useState(false)
  const [ativarRow, setAtivarRow] = useState<LojistaRow | null>(null)
  const [ativarPlano, setAtivarPlano] = useState<Plan>('START')
  const [ativarVence, setAtivarVence] = useState(() => addDaysIso(null, 30))

  const [renovarOpen, setRenovarOpen] = useState(false)
  const [renovarRow, setRenovarRow] = useState<LojistaRow | null>(null)
  const [renovarPlano, setRenovarPlano] = useState<Plan>('START')
  const [renovarVence, setRenovarVence] = useState('')

  const [confirmBlock, setConfirmBlock] = useState<LojistaRow | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<LojistaRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('filtro', filtro)
    if (q.trim()) params.set('q', q.trim())
    const res = await fetch(`/api/admin/lojistas?${params.toString()}`, {
      credentials: 'include',
    })
    const data = (await res.json()) as {
      ok?: boolean
      metrics?: Metrics
      lojistas?: LojistaRow[]
      error?: string
    }
    if (data.ok && data.metrics && data.lojistas) {
      setMetrics(data.metrics)
      setRows(data.lojistas)
    }
    setLoading(false)
  }, [filtro, q])

  useEffect(() => {
    void load()
  }, [load])

  function openAtivar(row: LojistaRow) {
    setAtivarRow(row)
    setAtivarPlano('GROWTH')
    setAtivarVence(addDaysIso(null, 30))
    setAtivarOpen(true)
  }

  function openRenovar(row: LojistaRow) {
    setRenovarRow(row)
    setRenovarPlano(row.plano)
    setRenovarVence(addDaysIso(row.plano_vence_em, 30))
    setRenovarOpen(true)
  }

  async function postAtivar() {
    if (!ativarRow) return
    setBusyId(ativarRow.id)
    try {
      const res = await fetch(`/api/admin/lojistas/${ativarRow.id}/ativar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plano: ativarPlano, plano_vence_em: ativarVence }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        alert(data.error || 'Erro')
        return
      }
      setAtivarOpen(false)
      setAtivarRow(null)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function postRenovar() {
    if (!renovarRow) return
    setBusyId(renovarRow.id)
    try {
      const res = await fetch(`/api/admin/lojistas/${renovarRow.id}/renovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plano: renovarPlano, plano_vence_em: renovarVence }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        alert(data.error || 'Erro')
        return
      }
      setRenovarOpen(false)
      setRenovarRow(null)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function postBloquear(row: LojistaRow) {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/admin/lojistas/${row.id}/bloquear`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        alert(data.error || 'Erro')
        return
      }
      setConfirmBlock(null)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function postCancelar(row: LojistaRow) {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/admin/lojistas/${row.id}/cancelar`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        alert(data.error || 'Erro')
        return
      }
      setConfirmCancel(null)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <h1 className="text-2xl font-bold tracking-tight text-[#1a1614]">Lojistas</h1>
      <p className="mt-1 text-sm text-[#6b7280]">
        Gerir planos, estados e acessos manualmente.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics ? (
          <>
            <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                Total
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[#1a1614]">
                {metrics.total}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                Ativos
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--dash-success)]">
                {metrics.ativos}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                Pendentes
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-amber-700">
                {metrics.pendentes}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                Bloqueados / Cancelados
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[#6b7280]">
                {metrics.bloqueadosCancelados}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-[#6b7280]">A carregar métricas…</p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {filtros.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filtro === f.id
                  ? 'bg-[var(--dash-primary)] text-white shadow-sm'
                  : 'border border-[var(--card-border)] bg-white text-[#374151] hover:bg-[#f9fafb]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Buscar nome, email ou telefone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full max-w-md rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm text-[#1a1614] outline-none focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/12 lg:w-80"
        />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--card-border)] bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-[var(--card-border)] bg-[#f9fafb] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Vence em</th>
              <th className="px-4 py-3">Cadastro</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--card-border)]">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[#6b7280]">
                  A carregar…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[#6b7280]">
                  Nenhum resultado.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="bg-white">
                  <td className="px-4 py-3 font-medium text-[#1a1614]">
                    <Link
                      href={`/admin/lojistas/${row.id}`}
                      className="text-[var(--dash-primary)] hover:underline"
                    >
                      {row.nome || '—'}
                    </Link>
                  </td>
                  <td className="max-w-[12rem] truncate px-4 py-3 text-[#374151]">
                    {row.email ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-[#374151]">{row.telefone ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-[#1a1614]">
                    {planShortLabel(row.plano)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[#374151]">
                    {fmtDate(row.plano_vence_em)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[#6b7280]">
                    {fmtDate(row.cadastrado_em)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(row.status === 'pendente' || row.status === 'bloqueado') && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => openAtivar(row)}
                          className="rounded-lg bg-[var(--dash-primary)] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                        >
                          Ativar
                        </button>
                      )}
                      {row.status === 'ativo' && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => openRenovar(row)}
                            className="rounded-lg border border-[var(--card-border)] bg-white px-2 py-1 text-[11px] font-semibold text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50"
                          >
                            Renovar
                          </button>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => setConfirmBlock(row)}
                            className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-800 disabled:opacity-50"
                          >
                            Bloquear
                          </button>
                        </>
                      )}
                      {(row.status === 'ativo' || row.status === 'bloqueado') && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => setConfirmCancel(row)}
                          className="rounded-lg border border-[var(--card-border)] px-2 py-1 text-[11px] font-semibold text-[#6b7280] hover:bg-[#f9fafb] disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={ativarOpen}
        title="Confirmar ativação"
        onClose={() => !busyId && setAtivarOpen(false)}
      >
        {ativarRow ? (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-[#374151]">
              Plano
              <select
                className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                value={ativarPlano}
                onChange={(e) => setAtivarPlano(e.target.value as Plan)}
              >
                {ADMIN_PLAN_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label} {o.priceLabel}/mês
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-[#374151]">
              Data de vencimento
              <input
                type="date"
                className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                value={ativarVence}
                onChange={(e) => setAtivarVence(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!!busyId}
              onClick={() => void postAtivar()}
              className="w-full rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50"
            >
              Confirmar ativação
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={renovarOpen}
        title="Confirmar renovação"
        onClose={() => !busyId && setRenovarOpen(false)}
      >
        {renovarRow ? (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-[#374151]">
              Plano
              <select
                className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                value={renovarPlano}
                onChange={(e) => setRenovarPlano(e.target.value as Plan)}
              >
                {ADMIN_PLAN_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label} {o.priceLabel}/mês
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-[#374151]">
              Nova data de vencimento
              <input
                type="date"
                className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                value={renovarVence}
                onChange={(e) => setRenovarVence(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!!busyId}
              onClick={() => void postRenovar()}
              className="w-full rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50"
            >
              Confirmar renovação
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!confirmBlock}
        title="Bloquear acesso"
        onClose={() => !busyId && setConfirmBlock(null)}
      >
        {confirmBlock ? (
          <div className="space-y-4">
            <p className="text-sm text-[#374151]">
              Bloquear acesso de <strong>{confirmBlock.nome}</strong>?
            </p>
            <button
              type="button"
              disabled={!!busyId}
              onClick={() => void postBloquear(confirmBlock)}
              className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
            >
              Bloquear
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!confirmCancel}
        title="Cancelar assinatura"
        onClose={() => !busyId && setConfirmCancel(null)}
      >
        {confirmCancel ? (
          <div className="space-y-4">
            <p className="text-sm text-[#374151]">
              Cancelar assinatura de <strong>{confirmCancel.nome}</strong>?
            </p>
            <button
              type="button"
              disabled={!!busyId}
              onClick={() => void postCancelar(confirmCancel)}
              className="w-full rounded-xl border border-[var(--card-border)] bg-[#f3f4f6] py-2.5 text-sm font-semibold text-[#374151] disabled:opacity-50"
            >
              Cancelar assinatura
            </button>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
