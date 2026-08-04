'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AdminWhatsAppSummary } from '@/lib/whatsapp/types'

function statusTone(status: string): string {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'error') return 'bg-red-50 text-red-700 border-red-200'
  if (status === 'disconnected') return 'bg-zinc-100 text-zinc-600 border-zinc-200'
  if (status === 'pending') return 'bg-amber-50 text-amber-800 border-amber-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Activo'
    case 'pending':
      return 'Pendente'
    case 'disconnected':
      return 'Desligado'
    case 'error':
      return 'Erro'
    case 'nao_configurado':
      return 'Não configurado'
    default:
      return status
  }
}

export function AdminWhatsAppControl({ lojistaId }: { lojistaId: string }) {
  const [info, setInfo] = useState<AdminWhatsAppSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showConnect, setShowConnect] = useState(false)
  const [wabaId, setWabaId] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [displayPhone, setDisplayPhone] = useState('')

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

  async function connect() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/lojistas/${lojistaId}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'connect',
          waba_id: wabaId,
          phone_number_id: phoneNumberId,
          access_token: accessToken,
          display_phone_e164: displayPhone || undefined,
        }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        webhook_subscribed?: boolean
        templates_scheduled?: boolean
      }
      if (!res.ok) {
        setMsg(data.error || 'Falha ao ligar WhatsApp.')
        return
      }
      setAccessToken('')
      setShowConnect(false)
      setMsg(
        `WhatsApp ligado.${data.webhook_subscribed ? ' Webhook subscrito.' : ' Aviso: webhook não subscrito — verificar na Meta.'}${data.templates_scheduled ? ' Templates enviados à Meta.' : ''}`
      )
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!confirm('Desligar WhatsApp desta loja?')) return
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

  const status = info?.status ?? 'nao_configurado'

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
          {info?.onboarding_requested_at ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <p className="font-semibold">Solicitação do lojista</p>
              {info.onboarding_contact_phone ? (
                <p className="mt-1">
                  Telefone: <strong>{info.onboarding_contact_phone}</strong>
                </p>
              ) : null}
              {info.onboarding_notes ? <p className="mt-1">{info.onboarding_notes}</p> : null}
              <p className="mt-1 text-amber-800/80">
                Pedido em {new Date(info.onboarding_requested_at).toLocaleString('pt-BR')}
              </p>
            </div>
          ) : null}

          <dl className="grid grid-cols-2 gap-2 text-xs text-[#374151]">
            <div>
              <dt className="text-[#9ca3af]">Número</dt>
              <dd className="font-medium">
                {info?.verified_phone_formatted ||
                  info?.display_phone_e164 ||
                  '—'}
              </dd>
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
          </dl>

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
              Desligar WhatsApp
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowConnect((v) => !v)}
              className="rounded-lg bg-[#1877F2] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-50"
            >
              {showConnect ? 'Cancelar' : 'Ligar manualmente'}
            </button>
          )}

          {showConnect && status !== 'active' ? (
            <div className="space-y-2 rounded-lg border border-[var(--card-border)] bg-zinc-50 p-3">
              <label className="block text-xs">
                <span className="font-medium text-[#374151]">WABA ID</span>
                <input
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-2 py-1.5 font-mono text-xs"
                  placeholder="749870614887600"
                />
              </label>
              <label className="block text-xs">
                <span className="font-medium text-[#374151]">Phone Number ID</span>
                <input
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-2 py-1.5 font-mono text-xs"
                  placeholder="1162876776919791"
                />
              </label>
              <label className="block text-xs">
                <span className="font-medium text-[#374151]">Access token (system user)</span>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-2 py-1.5 font-mono text-xs"
                  autoComplete="off"
                />
              </label>
              <label className="block text-xs">
                <span className="font-medium text-[#374151]">Telefone E.164 (opcional)</span>
                <input
                  value={displayPhone}
                  onChange={(e) => setDisplayPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-2 py-1.5 text-xs"
                  placeholder="5511999999999"
                />
              </label>
              <button
                type="button"
                disabled={busy || !wabaId || !phoneNumberId || !accessToken}
                onClick={() => void connect()}
                className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-50"
              >
                Confirmar ligação
              </button>
            </div>
          ) : null}

          {msg ? <p className="text-xs text-[#374151]">{msg}</p> : null}
        </div>
      )}
    </section>
  )
}
