'use client'

import { useEffect, useState } from 'react'

type BillingConfig = {
  enabled: boolean
  receiver_name: string | null
  receiver_document: string | null
  mp_access_token_masked: string | null
  has_webhook_secret: boolean
  updated_at: string | null
}

export function AdminCobrancaClient({
  initialWebhookUrl,
}: {
  initialWebhookUrl: string
}) {
  const [config, setConfig] = useState<BillingConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [enabled, setEnabled] = useState(false)
  const [receiverName, setReceiverName] = useState('')
  const [receiverDocument, setReceiverDocument] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const resp = await fetch('/api/admin/billing-config', { cache: 'no-store' })
        const data = (await resp.json().catch(() => ({}))) as {
          ok?: boolean
          config?: BillingConfig
          error?: string
        }
        if (!resp.ok || !data.ok || !data.config) {
          setError(data.error || 'Não foi possível carregar a configuração.')
          return
        }
        setConfig(data.config)
        setEnabled(data.config.enabled)
        setReceiverName(data.config.receiver_name ?? '')
        setReceiverDocument(data.config.receiver_document ?? '')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro de rede')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const body: Record<string, unknown> = {
        enabled,
        receiver_name: receiverName,
        receiver_document: receiverDocument,
      }
      if (accessToken.trim()) body.mp_access_token = accessToken.trim()
      if (webhookSecret.trim()) body.mp_webhook_secret = webhookSecret.trim()

      const resp = await fetch('/api/admin/billing-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean
        config?: BillingConfig
        error?: string
      }
      if (!resp.ok || !data.ok || !data.config) {
        setError(data.error || 'Falha ao guardar.')
        return
      }
      setConfig(data.config)
      setAccessToken('')
      setWebhookSecret('')
      setSuccess('Configuração guardada.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro de rede')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-[#6b7280]">A carregar…</p>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-brand text-2xl font-bold text-vyria-navy">Cobrança PIX (Mercado Pago)</h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          Credenciais da conta Vyria no Mercado Pago para mensalidades recorrentes via PIX.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 text-sm shadow-sm">
        <p className="font-semibold text-[#1a1614]">Webhook em produção</p>
        <p className="mt-1 text-[#6b7280]">
          Configura no painel Mercado Pago a URL abaixo (eventos de pagamento):
        </p>
        <code className="mt-2 block break-all rounded-lg bg-[#f3f4f6] px-3 py-2 text-xs">
          {initialWebhookUrl}
        </code>
      </div>

      <form onSubmit={(e) => void handleSave(e)} className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <label className="flex items-center gap-3 text-sm font-medium text-[#1a1614]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Cobrança automática ativa
        </label>

        <div>
          <label className="text-xs font-medium text-[#6b7280]">Access Token Mercado Pago</label>
          {config?.mp_access_token_masked ? (
            <p className="mt-1 text-xs text-[#6b7280]">Actual: {config.mp_access_token_masked}</p>
          ) : null}
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Deixa em branco para manter o actual"
            className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[#6b7280]">Webhook secret (opcional)</label>
          {config?.has_webhook_secret ? (
            <p className="mt-1 text-xs text-emerald-700">Secret configurado</p>
          ) : null}
          <input
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="Assinatura x-signature do MP"
            className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            autoComplete="off"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-[#6b7280]">Nome do recebedor</label>
            <input
              type="text"
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#6b7280]">Documento (CPF/CNPJ)</label>
            <input
              type="text"
              value={receiverDocument}
              onChange={(e) => setReceiverDocument(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-vyria-navy px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'A guardar…' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}
