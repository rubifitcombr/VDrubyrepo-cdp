'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  FISCAL_STATUS_LABEL,
  parseFiscalStatus,
  type FiscalStatus,
} from '@/lib/fiscal'

type FiscalInfo = {
  status: FiscalStatus
  ambiente: string
  cnpj: string | null
  razaoSocial: string | null
  hasToken: boolean
  configured: boolean
}

function statusTone(status: FiscalStatus): string {
  if (status === 'ativo') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'pending_review') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (status === 'bloqueado') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

export function AdminFiscalControl({ lojistaId }: { lojistaId: string }) {
  const [info, setInfo] = useState<FiscalInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [ambiente, setAmbiente] = useState('homologacao')
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${lojistaId}/fiscal`, {
        credentials: 'include',
      })
      const data = (await res.json()) as { fiscal?: Record<string, unknown> }
      if (res.ok && data.fiscal) {
        const f = data.fiscal
        const next: FiscalInfo = {
          status: parseFiscalStatus(f.status),
          ambiente: String(f.ambiente ?? 'homologacao'),
          cnpj: (f.cnpj as string | null) ?? null,
          razaoSocial: (f.razaoSocial as string | null) ?? null,
          hasToken: Boolean(f.hasToken),
          configured: Boolean(f.configured),
        }
        setInfo(next)
        setAmbiente(next.ambiente)
      }
    } finally {
      setLoading(false)
    }
  }, [lojistaId])

  useEffect(() => {
    void load()
  }, [load])

  async function act(action: 'ativar' | 'bloquear') {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/lojistas/${lojistaId}/fiscal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, ambiente }),
      })
      const data = (await res.json()) as { status?: string; error?: string }
      if (!res.ok) {
        setMsg(data.error || 'Falha ao atualizar status fiscal.')
        return
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  const status = info?.status ?? 'nao_configurado'

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
          Status fiscal (NFC-e)
        </h3>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusTone(status)}`}>
          {FISCAL_STATUS_LABEL[status]}
        </span>
      </div>

      {loading ? (
        <p className="mt-2 text-xs text-[#9ca3af]">A carregar…</p>
      ) : (
        <div className="mt-3 space-y-3">
          <dl className="grid grid-cols-2 gap-2 text-xs text-[#374151]">
            <div>
              <dt className="text-[#9ca3af]">CNPJ</dt>
              <dd className="font-medium">{info?.cnpj || '—'}</dd>
            </div>
            <div>
              <dt className="text-[#9ca3af]">Razão social</dt>
              <dd className="font-medium">{info?.razaoSocial || '—'}</dd>
            </div>
            <div>
              <dt className="text-[#9ca3af]">Token Brasil NFe</dt>
              <dd className="font-medium">{info?.hasToken ? 'Configurado' : 'Ausente'}</dd>
            </div>
            <div>
              <dt className="text-[#9ca3af]">Ambiente atual</dt>
              <dd className="font-medium">{info?.ambiente === 'producao' ? 'Produção' : 'Homologação'}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={ambiente}
              onChange={(e) => setAmbiente(e.target.value)}
              className="rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="homologacao">Homologação</option>
              <option value="producao">Produção</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act('ativar')}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-50"
            >
              Ativar
            </button>
            <button
              type="button"
              disabled={busy || status !== 'ativo'}
              onClick={() => void act('bloquear')}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Bloquear
            </button>
          </div>

          {!info?.hasToken ? (
            <p className="text-xs text-amber-700">
              Empresa ainda não sincronizada com a Brasil NFe. O lojista deve usar
              &quot;Sincronizar com Brasil NFe&quot; no painel fiscal.
            </p>
          ) : null}
          {msg ? <p className="text-xs text-[#374151]">{msg}</p> : null}
        </div>
      )}
    </section>
  )
}
