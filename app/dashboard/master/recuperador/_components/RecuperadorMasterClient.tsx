'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type {
  InactiveCustomer,
  RecoveryCampaignRow,
  RecoveryReport,
  RecoverySendRow,
  StoreRecoveryConfig,
} from '@/lib/recovery/types'

function money(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100
  )
}

function statusLabel(status: string): string {
  switch (status) {
    case 'sending':
      return 'A enviar'
    case 'completed':
      return 'Concluída'
    case 'paused':
      return 'Pausada'
    default:
      return 'Rascunho'
  }
}

export function RecuperadorMasterClient() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [config, setConfig] = useState<StoreRecoveryConfig | null>(null)
  const [report, setReport] = useState<RecoveryReport | null>(null)
  const [campaigns, setCampaigns] = useState<RecoveryCampaignRow[]>([])
  const [sends, setSends] = useState<RecoverySendRow[]>([])
  const [inactivePreview, setInactivePreview] = useState<InactiveCustomer[] | null>(null)

  const [campaignName, setCampaignName] = useState('')
  const [campaignDays, setCampaignDays] = useState('30')
  const [campaignTemplate, setCampaignTemplate] = useState('')

  const load = useCallback(async (previewDays?: number) => {
    setLoading(true)
    setError(null)
    try {
      const qs =
        previewDays && previewDays >= 7 ? `?preview_days=${previewDays}` : ''
      const res = await fetch(`/api/master/recovery/config${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar.')
      setConfig(json.config)
      setReport(json.report)
      setCampaigns(json.campaigns ?? [])
      setSends(json.sends ?? [])
      setInactivePreview(json.inactivePreview)
      if (json.config) {
        setCampaignDays(String(json.config.default_inactive_days))
        setCampaignTemplate((prev) =>
          prev ? prev : json.config.default_message_template
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveConfig(patch: Partial<StoreRecoveryConfig>) {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/master/recovery/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao guardar.')
      setConfig(json.config)
      setSuccess('Configurações guardadas.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar.')
    } finally {
      setSaving(false)
    }
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/master/recovery/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          inactive_days: Number(campaignDays),
          message_template: campaignTemplate,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao criar campanha.')
      setSuccess('Campanha criada.')
      setCampaignName('')
      void load(Number(campaignDays))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar campanha.')
    } finally {
      setSaving(false)
    }
  }

  async function sendCampaign(campaignId: string) {
    if (!confirm('Enviar mensagens WhatsApp para clientes inactivos? (máx. 50 por vez)')) {
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/master/recovery/campaigns/${campaignId}/send`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha no envio.')
      setSuccess(
        `Campanha enviada: ${json.sent} mensagens (${json.failed} falhas de ${json.eligible} elegíveis).`
      )
      void load(Number(campaignDays))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro no envio.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-vyria-navy-muted">A carregar…</p>
  }

  if (!config) return null

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Campanhas', String(report?.campaigns_total ?? 0)],
          ['Mensagens enviadas', String(report?.sends_total ?? 0)],
          ['Conversões', String(report?.conversions_total ?? 0)],
          ['Taxa de conversão', `${report?.conversion_rate_pct ?? 0}%`],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
              {label}
            </p>
            <p className="mt-2 font-brand text-2xl font-bold text-vyria-navy">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-brand text-lg font-bold text-vyria-navy">Relatório geral</h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              Receita atribuída a campanhas de recuperação.
            </p>
          </div>
          <p className="font-brand text-xl font-bold text-violet-800">
            {money(report?.revenue_cents_total ?? 0)}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Configuração padrão</h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.enabled}
              disabled={saving}
              onChange={(e) => void saveConfig({ enabled: e.target.checked })}
            />
            Recuperador activo
          </label>
        </div>
        <div className="mt-4 grid gap-4">
          <label className="block text-sm sm:max-w-xs">
            <span className="font-medium text-vyria-navy">Dias sem pedir (padrão)</span>
            <input
              type="number"
              min={7}
              max={365}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              defaultValue={config.default_inactive_days}
              onBlur={(e) => {
                const days = Number(e.target.value)
                void saveConfig({ default_inactive_days: days })
                void load(days)
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Modelo de mensagem padrão</span>
            <textarea
              rows={4}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              defaultValue={config.default_message_template}
              onBlur={(e) =>
                void saveConfig({ default_message_template: e.target.value })
              }
            />
            <span className="mt-1 block text-xs text-vyria-navy-muted">
              Variáveis: {'{{nome}}'}, {'{{loja}}'}, {'{{link}}'}, {'{{dias}}'}
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">
          Pré-visualização — clientes inactivos
        </h2>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Clientes sem pedido há mais de {config.default_inactive_days} dias (últimos 5000
          pedidos analisados).
        </p>
        {!inactivePreview || inactivePreview.length === 0 ? (
          <p className="mt-3 text-sm text-vyria-navy-muted">
            Nenhum cliente inactivo encontrado com este critério.
          </p>
        ) : (
          <div className="mt-4 max-h-64 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-vyria-navy-muted">
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Telefone</th>
                  <th className="py-2">Inactivo há</th>
                </tr>
              </thead>
              <tbody>
                {inactivePreview.slice(0, 20).map((c) => (
                  <tr key={c.customer_phone} className="border-b border-[var(--card-border)]">
                    <td className="py-2 pr-4">{c.customer_name || '—'}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{c.customer_phone}</td>
                    <td className="py-2">{c.days_inactive} dias</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {inactivePreview.length > 20 ? (
              <p className="mt-2 text-xs text-vyria-navy-muted">
                + {inactivePreview.length - 20} clientes elegíveis
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Nova campanha</h2>
        <form onSubmit={createCampaign} className="mt-4 grid gap-4">
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Nome da campanha</span>
            <input
              required
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Ex.: Março — clientes 30 dias"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-vyria-navy">Dias inactivos</span>
              <input
                type="number"
                min={7}
                max={365}
                className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                value={campaignDays}
                onChange={(e) => setCampaignDays(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Mensagem</span>
            <textarea
              required
              rows={4}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              value={campaignTemplate}
              onChange={(e) => setCampaignTemplate(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="btn-vyria-gradient w-fit rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            Criar campanha
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Campanhas</h2>
        {campaigns.length === 0 ? (
          <p className="mt-3 text-sm text-vyria-navy-muted">Nenhuma campanha criada.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--card-border)]">
            {campaigns.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"
              >
                <div>
                  <p className="font-semibold text-vyria-navy">{c.name}</p>
                  <p className="mt-1 text-vyria-navy-muted">
                    {statusLabel(c.status)} · {c.inactive_days} dias · {c.sent_count} envios ·{' '}
                    {c.converted_count} conversões
                  </p>
                </div>
                {c.status === 'draft' ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void sendCampaign(c.id)}
                    className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-60"
                  >
                    Enviar agora
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Envios recentes</h2>
        {sends.length === 0 ? (
          <p className="mt-3 text-sm text-vyria-navy-muted">Nenhum envio registado.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--card-border)]">
            {sends.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <div>
                  <span className="text-vyria-navy">{s.customer_name || s.customer_phone}</span>
                  {s.error_message ? (
                    <span className="ml-2 text-red-700">({s.error_message})</span>
                  ) : (
                    <span className="ml-2 text-emerald-700">(enviado)</span>
                  )}
                </div>
                <time className="text-xs text-vyria-navy-muted">
                  {new Date(s.sent_at).toLocaleString('pt-BR')}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-sm text-vyria-navy-muted">
        <Link href="/dashboard/master" className="font-semibold text-vyria-plum hover:underline">
          ← Voltar ao hub Master
        </Link>
      </p>
    </div>
  )
}
