'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AdminWhatsAppSummary } from '@/lib/whatsapp/types'

function statusTone(status: string): string {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'error') return 'bg-red-50 text-red-700 border-red-200'
  if (status === 'disconnected') return 'bg-zinc-100 text-zinc-600 border-zinc-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Activo (coexistência)'
    case 'disconnected':
      return 'Desligado'
    case 'error':
      return 'Erro'
    case 'nao_configurado':
      return 'Não conectado'
    default:
      return 'Não conectado'
  }
}

export function AdminWhatsAppControl({ lojistaId }: { lojistaId: string }) {
  const [info, setInfo] = useState<AdminWhatsAppSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${lojistaId}/whatsapp`, {
        credentials: 'include',
      })
      const data = (await res.json()) as { whatsapp?: AdminWhatsAppSummary; error?: string }
      if (res.ok && data.whatsapp) {
        setInfo(data.whatsapp)
      } else {
        setMsg(data.error || 'Falha ao carregar WhatsApp.')
      }
    } finally {
      setLoading(false)
    }
  }, [lojistaId])

  useEffect(() => {
    void load()
  }, [load])

  async function disconnect() {
    if (!confirm('Desligar WhatsApp desta loja? O lojista terá de reconectar com Facebook.')) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/lojistas/${lojistaId}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'disconnect' }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setMsg(data.error || 'Falha ao desligar.')
        return
      }
      setMsg('WhatsApp desligado.')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const status = info?.status === 'active' ? 'active' : info?.configured ? info.status : 'nao_configurado'

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
          WhatsApp Master
        </h3>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusTone(status)}`}
        >
          {statusLabel(status)}
        </span>
      </div>

      {loading ? (
        <p className="mt-2 text-xs text-[#9ca3af]">A carregar…</p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-[#6b7280]">
            A ligação é feita pelo lojista no painel via <strong>Conectar com Facebook</strong>{' '}
            (coexistência). Este painel é só para monitorização e suporte.
          </p>

          <dl className="grid grid-cols-2 gap-2 text-xs text-[#374151]">
            <div>
              <dt className="text-[#9ca3af]">Número</dt>
              <dd className="font-medium">
                {info?.verified_phone_formatted || info?.display_phone_e164 || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[#9ca3af]">Nome verificado</dt>
              <dd className="font-medium">{info?.verified_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-[#9ca3af]">WABA ID</dt>
              <dd className="break-all font-mono text-[11px]">{info?.waba_id || '—'}</dd>
            </div>
            <div>
              <dt className="text-[#9ca3af]">Phone Number ID</dt>
              <dd className="break-all font-mono text-[11px]">{info?.phone_number_id || '—'}</dd>
            </div>
            <div>
              <dt className="text-[#9ca3af]">Templates aprovados</dt>
              <dd className="font-medium">
                {info?.templates_approved ?? 0}/{info?.templates_total ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-[#9ca3af]">Webhook</dt>
              <dd className="font-medium">
                {info?.webhook_verified_at
                  ? new Date(info.webhook_verified_at).toLocaleString('pt-BR')
                  : 'Sem actividade'}
              </dd>
            </div>
          </dl>

          {info?.last_error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              {info.last_error}
            </p>
          ) : null}

          <p className="text-[11px] text-[#6b7280]">
            Webhook Vyria:{' '}
            <code className="break-all rounded bg-zinc-100 px-1">{info?.webhook_url}</code>
          </p>

          {status === 'active' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void disconnect()}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Desligar (suporte)
            </button>
          ) : (
            <p className="text-xs text-[#9ca3af]">
              Aguardando o lojista conectar em Dashboard → WhatsApp → Conectar com Facebook.
            </p>
          )}

          {msg ? <p className="text-xs text-[#374151]">{msg}</p> : null}
        </div>
      )}
    </section>
  )
}
