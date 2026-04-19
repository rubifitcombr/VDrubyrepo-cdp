'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ADMIN_PLAN_OPTIONS } from '@/lib/admin-plans'
import type { MerchantStatus } from '@/lib/merchant-status'
import { statusBadgeClass, statusLabel } from '@/lib/merchant-status'
import { planShortLabel, type Plan } from '@/lib/plan'
import { useCallback, useEffect, useState } from 'react'

type LojistaDetail = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  plano: Plan
  status: MerchantStatus
  plano_vence_em: string | null
  cadastrado_em: string | null
  plano_ativado_em: string | null
  plano_atualizado_em: string | null
}

type LogRow = {
  id: number
  criado_em: string
  acao: string
  detalhes: string | null
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  return d.toLocaleDateString('pt-BR')
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[#1a1614]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl leading-none text-[#6b7280] hover:bg-[#f5f5f5]"
          >
            ×
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}

export function LojistaDetailClient() {
  const params = useParams()
  const router = useRouter()
  const id = String(params.id ?? '')

  const [loading, setLoading] = useState(true)
  const [lojista, setLojista] = useState<LojistaDetail | null>(null)
  const [logs, setLogs] = useState<LogRow[]>([])

  const [ativarOpen, setAtivarOpen] = useState(false)
  const [ativarPlano, setAtivarPlano] = useState<Plan>('GROWTH')
  const [ativarVence, setAtivarVence] = useState(() => addDaysIso(null, 30))

  const [renovarOpen, setRenovarOpen] = useState(false)
  const [renovarPlano, setRenovarPlano] = useState<Plan>('START')
  const [renovarDias, setRenovarDias] = useState(30)

  const [confirmBlock, setConfirmBlock] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)

  const [fatDesc, setFatDesc] = useState('')
  const [fatValor, setFatValor] = useState('')
  const [fatStatus, setFatStatus] = useState<'pago' | 'pendente' | 'falhou'>('pendente')
  const [fatBusy, setFatBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/lojistas/${id}`, { credentials: 'include' })
    const data = (await res.json()) as {
      ok?: boolean
      lojista?: LojistaDetail
      logs?: LogRow[]
      error?: string
    }
    if (!res.ok || !data.ok || !data.lojista) {
      setLojista(null)
      setLogs([])
    } else {
      setLojista(data.lojista)
      setLogs(data.logs ?? [])
      setRenovarPlano(data.lojista.plano)
      setRenovarDias(30)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function postAtivar() {
    if (!lojista) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${id}/ativar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plano: ativarPlano, plano_vence_em: ativarVence }),
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) {
        alert(j.error || 'Erro')
        return
      }
      setAtivarOpen(false)
      await load()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function postRenovar() {
    if (!lojista) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${id}/renovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plano: renovarPlano, dias: renovarDias }),
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) {
        alert(j.error || 'Erro')
        return
      }
      setRenovarOpen(false)
      await load()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function postBloquear() {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${id}/bloquear`, {
        method: 'POST',
        credentials: 'include',
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) {
        alert(j.error || 'Erro')
        return
      }
      setConfirmBlock(false)
      await load()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function postCancelar() {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${id}/cancelar`, {
        method: 'POST',
        credentials: 'include',
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) {
        alert(j.error || 'Erro')
        return
      }
      setConfirmCancel(false)
      await load()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function postRegistrarFatura() {
    if (!fatDesc.trim()) {
      alert('Preenche a descrição.')
      return
    }
    const v = Number(String(fatValor).replace(',', '.'))
    if (!Number.isFinite(v) || v < 0) {
      alert('Valor inválido.')
      return
    }
    setFatBusy(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${id}/faturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          descricao: fatDesc.trim(),
          valor: v,
          status: fatStatus,
        }),
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) {
        alert(j.error || 'Erro')
        return
      }
      setFatDesc('')
      setFatValor('')
      setFatStatus('pendente')
      alert('Fatura registada.')
    } finally {
      setFatBusy(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-[#6b7280]">A carregar…</p>
  }

  if (!lojista) {
    return (
      <p className="text-sm text-red-700">
        Lojista não encontrado.{' '}
        <Link href="/admin/lojistas" className="text-[var(--dash-primary)] underline">
          Voltar
        </Link>
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav className="text-xs text-[#6b7280]">
        <Link href="/admin/lojistas" className="hover:text-[#1a1614]">
          Lojistas
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-[#1a1614]">{lojista.nome}</span>
      </nav>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-[#1a1614]">Dados do lojista</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[#6b7280]">Nome</dt>
            <dd className="font-medium text-[#1a1614]">{lojista.nome}</dd>
          </div>
          <div>
            <dt className="text-[#6b7280]">Email</dt>
            <dd className="font-medium text-[#1a1614]">{lojista.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[#6b7280]">Telefone</dt>
            <dd className="font-medium text-[#1a1614]">{lojista.telefone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[#6b7280]">Cadastro</dt>
            <dd className="font-medium text-[#1a1614]">{fmtDate(lojista.cadastrado_em)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-[#1a1614]">Assinatura atual</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[#6b7280]">Plano</dt>
            <dd className="font-medium text-[#1a1614]">{planShortLabel(lojista.plano)}</dd>
          </div>
          <div>
            <dt className="text-[#6b7280]">Status</dt>
            <dd>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(lojista.status)}`}
              >
                {statusLabel(lojista.status)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[#6b7280]">Ativação</dt>
            <dd className="font-medium text-[#1a1614]">{fmtDate(lojista.plano_ativado_em)}</dd>
          </div>
          <div>
            <dt className="text-[#6b7280]">Vencimento</dt>
            <dd className="font-medium text-[#1a1614]">{fmtDate(lojista.plano_vence_em)}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          {(lojista.status === 'pendente' || lojista.status === 'bloqueado') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setAtivarPlano('GROWTH')
                setAtivarVence(addDaysIso(null, 30))
                setAtivarOpen(true)
              }}
              className="rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Ativar
            </button>
          )}
          {lojista.status === 'ativo' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRenovarOpen(true)}
                className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2 text-sm font-semibold text-[#374151] disabled:opacity-50"
              >
                Renovar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmBlock(true)}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
              >
                Bloquear
              </button>
            </>
          )}
          {(lojista.status === 'ativo' || lojista.status === 'bloqueado') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
              className="rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold text-[#6b7280] disabled:opacity-50"
            >
              Cancelar assinatura
            </button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-[#1a1614]">Registrar fatura</h2>
        <p className="mt-1 text-sm text-[#6b7280]">
          Regista manualmente uma fatura para o lojista (aparece em Assinatura no painel).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-[#374151] sm:col-span-2">
            Descrição
            <input
              type="text"
              className="mt-2 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              placeholder='Ex.: Vyria Growth — Maio 2026'
              value={fatDesc}
              onChange={(e) => setFatDesc(e.target.value)}
              disabled={fatBusy}
            />
          </label>
          <label className="block text-sm font-medium text-[#374151]">
            Valor (R$)
            <input
              type="text"
              inputMode="decimal"
              className="mt-2 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              placeholder="0,00"
              value={fatValor}
              onChange={(e) => setFatValor(e.target.value)}
              disabled={fatBusy}
            />
          </label>
          <label className="block text-sm font-medium text-[#374151]">
            Estado
            <select
              className="mt-2 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              value={fatStatus}
              onChange={(e) =>
                setFatStatus(e.target.value as 'pago' | 'pendente' | 'falhou')
              }
              disabled={fatBusy}
            >
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
              <option value="falhou">Falhou</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={fatBusy}
          onClick={() => void postRegistrarFatura()}
          className="mt-4 rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {fatBusy ? 'A registar…' : 'Registrar'}
        </button>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-[#1a1614]">Histórico de ações</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-[var(--card-border)] text-xs font-semibold uppercase text-[#6b7280]">
              <tr>
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Ação</th>
                <th className="py-2">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-[#6b7280]">
                    Sem registos.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-4 tabular-nums text-[#374151]">
                      {fmtDateTime(log.criado_em)}
                    </td>
                    <td className="py-2 pr-4 font-medium text-[#1a1614]">{log.acao}</td>
                    <td className="py-2 text-[#6b7280]">{log.detalhes ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={ativarOpen} title="Confirmar ativação" onClose={() => !busy && setAtivarOpen(false)}>
        <div className="space-y-4">
          <label className="block text-sm font-medium text-[#374151]">
            Plano
            <select
              className="mt-2 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
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
              className="mt-2 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              value={ativarVence}
              onChange={(e) => setAtivarVence(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void postAtivar()}
            className="w-full rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white"
          >
            Confirmar ativação
          </button>
        </div>
      </Modal>

      <Modal open={renovarOpen} title="Confirmar renovação" onClose={() => !busy && setRenovarOpen(false)}>
        <div className="space-y-4">
          <label className="block text-sm font-medium text-[#374151]">
            Plano
            <select
              className="mt-2 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
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
            Estender (dias)
            <input
              type="number"
              min={1}
              max={730}
              className="mt-2 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              value={renovarDias}
              onChange={(e) => setRenovarDias(Math.max(1, Number(e.target.value) || 30))}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void postRenovar()}
            className="w-full rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white"
          >
            Confirmar renovação
          </button>
        </div>
      </Modal>

      <Modal open={confirmBlock} title="Bloquear acesso" onClose={() => !busy && setConfirmBlock(false)}>
        <div className="space-y-4">
          <p className="text-sm text-[#374151]">
            Bloquear acesso de <strong>{lojista.nome}</strong>?
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void postBloquear()}
            className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white"
          >
            Bloquear
          </button>
        </div>
      </Modal>

      <Modal open={confirmCancel} title="Cancelar assinatura" onClose={() => !busy && setConfirmCancel(false)}>
        <div className="space-y-4">
          <p className="text-sm text-[#374151]">
            Cancelar assinatura de <strong>{lojista.nome}</strong>?
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void postCancelar()}
            className="w-full rounded-xl border border-[var(--card-border)] bg-[#f3f4f6] py-2.5 text-sm font-semibold text-[#374151]"
          >
            Cancelar assinatura
          </button>
        </div>
      </Modal>
    </div>
  )
}
