'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  FISCAL_CERT_STATUS_LABEL,
  FISCAL_STATUS_LABEL,
  parseFiscalCertStatus,
  parseFiscalStatus,
  type FiscalCertStatus,
  type FiscalStatus,
} from '@/lib/fiscal'

type FiscalRow = {
  storeId: string
  storeName: string
  slug: string | null
  status: FiscalStatus
  ambiente: string
  cnpj: string
  razaoSocial: string
  certStatus: FiscalCertStatus
  certValidade: string
  hasToken: boolean
}

function statusTone(status: FiscalStatus): string {
  if (status === 'ativo') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'pending_review') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (status === 'bloqueado') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function certTone(status: FiscalCertStatus): string {
  if (status === 'valido') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'vencido' || status === 'invalido') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

export function AdminFiscalPanel() {
  const [rows, setRows] = useState<FiscalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ambienteById, setAmbienteById] = useState<Map<string, string>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/fiscal', { credentials: 'include' })
      const data = (await res.json()) as { items?: Record<string, unknown>[]; error?: string }
      if (!res.ok) {
        setMsg(data.error || 'Falha ao carregar lojas fiscais.')
        return
      }
      const items = (data.items ?? []).map((r) => ({
        storeId: String(r.storeId ?? ''),
        storeName: String(r.storeName ?? '—'),
        slug: (r.slug as string | null) ?? null,
        status: parseFiscalStatus(r.status),
        ambiente: String(r.ambiente ?? 'homologacao'),
        cnpj: String(r.cnpj ?? ''),
        razaoSocial: String(r.razaoSocial ?? ''),
        certStatus: parseFiscalCertStatus(r.certStatus),
        certValidade: String(r.certValidade ?? ''),
        hasToken: Boolean(r.hasToken),
      }))
      setRows(items)
      setAmbienteById(new Map(items.map((i) => [i.storeId, i.ambiente])))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function act(storeId: string, action: 'ativar' | 'bloquear' | 'cadastrar_empresa') {
    setBusyId(storeId)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/lojistas/${storeId}/fiscal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, ambiente: ambienteById.get(storeId) ?? 'homologacao' }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setMsg(data.error || 'Falha ao atualizar status fiscal.')
        return
      }
      if (action === 'cadastrar_empresa') {
        setMsg('Empresa cadastrada na Brasil NFe e token vinculado.')
      }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const counts = {
    total: rows.length,
    ativo: rows.filter((r) => r.status === 'ativo').length,
    pendente: rows.filter((r) => r.status === 'pending_review').length,
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1a1614]">Vyria Fiscal</h1>
          <p className="mt-1 text-sm text-[#6b7280]">
            Gestão do módulo de NFC-e por loja: ativar/bloquear emissão e acompanhar certificado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb]"
        >
          Atualizar
        </button>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-3">
          <p className="text-2xl font-bold tabular-nums text-[#1a1614]">{counts.total}</p>
          <p className="text-xs font-semibold text-[#6b7280]">Lojas configuradas</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
          <p className="text-2xl font-bold tabular-nums text-emerald-700">{counts.ativo}</p>
          <p className="text-xs font-semibold text-emerald-700">Ativas</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3">
          <p className="text-2xl font-bold tabular-nums text-amber-700">{counts.pendente}</p>
          <p className="text-xs font-semibold text-amber-700">Aguardando aprovação</p>
        </div>
      </div>

      {msg ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{msg}</p>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-[#9ca3af]">A carregar…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[#6b7280]">
            Nenhuma loja iniciou a configuração fiscal ainda.
          </p>
        ) : (
          <div className="divide-y divide-[var(--card-border)]">
            {rows.map((r) => (
              <div key={r.storeId} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-[#1a1614]">{r.storeName}</p>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusTone(r.status)}`}>
                      {FISCAL_STATUS_LABEL[r.status]}
                    </span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${certTone(r.certStatus)}`}>
                      {FISCAL_CERT_STATUS_LABEL[r.certStatus]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#6b7280]">
                    {r.razaoSocial || '—'}
                    {r.cnpj ? ` · CNPJ ${r.cnpj}` : ''}
                    {` · Token ${r.hasToken ? 'OK' : 'ausente'}`}
                    {` · ${r.ambiente === 'producao' ? 'Produção' : 'Homologação'}`}
                    {r.certValidade
                      ? ` · Cert. até ${new Date(r.certValidade).toLocaleDateString('pt-BR')}`
                      : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={ambienteById.get(r.storeId) ?? 'homologacao'}
                    onChange={(e) =>
                      setAmbienteById((prev) => new Map(prev).set(r.storeId, e.target.value))
                    }
                    className="rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1.5 text-xs"
                  >
                    <option value="homologacao">Homologação</option>
                    <option value="producao">Produção</option>
                  </select>
                  <button
                    type="button"
                    disabled={busyId === r.storeId}
                    onClick={() => void act(r.storeId, 'cadastrar_empresa')}
                    title="Cadastra a loja como Empresa na Brasil NFe e vincula o token"
                    className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--dash-primary)] hover:bg-[#f9fafb] disabled:opacity-50"
                  >
                    {r.hasToken ? 'Re-sincronizar token' : 'Cadastrar na Brasil NFe'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.storeId}
                    onClick={() => void act(r.storeId, 'ativar')}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-50"
                  >
                    Ativar
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.storeId || r.status !== 'ativo'}
                    onClick={() => void act(r.storeId, 'bloquear')}
                    className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Bloquear
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
