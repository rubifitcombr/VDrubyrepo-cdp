'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { formatPhoneDisplay } from '@/lib/loyalty/utils'
import { uploadMarketingCampaignImage } from '@/lib/storage-upload'
import type {
  MarketingAudienceContact,
  MarketingCampaignRow,
  MarketingReport,
  MarketingSendRow,
  StoreMarketingConfig,
  WhatsAppContactSummary,
} from '@/lib/marketing/types'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'Agendada'
    case 'sending':
      return 'A enviar'
    case 'completed':
      return 'Concluída'
    case 'cancelled':
      return 'Cancelada'
    case 'failed':
      return 'Falhou'
    default:
      return 'Rascunho'
  }
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
        {label}
      </p>
      <p className="mt-2 font-brand text-2xl font-bold text-vyria-navy">{value}</p>
      {hint ? <p className="mt-1 text-xs text-vyria-navy-muted">{hint}</p> : null}
    </div>
  )
}

type ContactRow = WhatsAppContactSummary | MarketingAudienceContact

export function MarketingMasterClient({ storeId }: { storeId: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [config, setConfig] = useState<StoreMarketingConfig | null>(null)
  const [report, setReport] = useState<MarketingReport | null>(null)
  const [campaigns, setCampaigns] = useState<MarketingCampaignRow[]>([])
  const [sends, setSends] = useState<MarketingSendRow[]>([])
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [audiencePreview, setAudiencePreview] = useState<MarketingAudienceContact[]>([])

  const [campaignName, setCampaignName] = useState('')
  const [campaignText, setCampaignText] = useState(
    'Olá {{nome}}! Temos novidades para você na nossa loja. Confira a imagem e peça pelo cardápio.'
  )
  const [imageUrl, setImageUrl] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/master/marketing/config')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar.')
      setConfig(json.config)
      setReport(json.report)
      setCampaigns(json.campaigns ?? [])
      setSends(json.sends ?? [])
      setContacts(json.contacts ?? [])
      setAudiencePreview(json.audiencePreview ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveConfig(patch: Partial<StoreMarketingConfig>) {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/master/marketing/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao guardar.')
      setConfig(json.config)
      setSuccess('Configurações guardadas.')
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleImageUpload(file: File | null) {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const { publicUrl, error: upErr } = await uploadMarketingCampaignImage(storeId, file)
      if (upErr || !publicUrl) throw upErr || new Error('Falha no upload.')
      setImageUrl(publicUrl)
      setImagePreview(publicUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar imagem.')
    } finally {
      setUploading(false)
    }
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/master/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          body_text: campaignText,
          image_url: imageUrl,
          scheduled_at: scheduledAt.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao criar campanha.')
      setSuccess(
        json.dispatch === 'scheduled'
          ? 'Campanha agendada com sucesso.'
          : 'Campanha criada — envio em curso.'
      )
      setCampaignName('')
      setScheduledAt('')
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar campanha.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelCampaign(campaignId: string) {
    if (!confirm('Cancelar esta campanha agendada?')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/master/marketing/campaigns/${campaignId}/cancel`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao cancelar.')
      setSuccess('Campanha cancelada.')
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao cancelar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !config) {
    return <p className="text-sm text-vyria-navy-muted">A carregar marketing…</p>
  }

  if (!config || !report) return null

  const eligibleCount = audiencePreview.length

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
        <StatCard label="Campanhas" value={String(report.campaigns_total)} />
        <StatCard label="Mensagens enviadas" value={String(report.sends_total)} />
        <StatCard
          label="Contactos WhatsApp"
          value={String(report.whatsapp_contacts_total)}
          hint="Registados automaticamente"
        />
        <StatCard
          label="Elegíveis agora"
          value={String(eligibleCount)}
          hint={`Máx. ${report.max_recipients_per_campaign} por campanha`}
        />
      </section>

      <section className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Configuração</h2>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm font-medium text-vyria-navy">
            <input
              type="checkbox"
              checked={config.enabled}
              disabled={saving}
              onChange={(e) => void saveConfig({ enabled: e.target.checked })}
            />
            Marketing activo
          </label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Intervalo entre envios (dias)</span>
            <input
              type="number"
              min={1}
              max={30}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              defaultValue={config.cooldown_days}
              onBlur={(e) => void saveConfig({ cooldown_days: Number(e.target.value) })}
            />
          </label>
          <div className="text-sm text-vyria-navy-muted">
            <p className="font-medium text-vyria-navy">Limites do plano</p>
            <p className="mt-1">
              Até <strong>{report.max_recipients_per_campaign}</strong> destinatários por campanha ·{' '}
              <strong>{report.max_campaigns_per_month}</strong> campanhas/mês (
              {report.campaigns_this_month} usadas este mês)
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Nova campanha</h2>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Envio para contactos que já falaram no WhatsApp ({eligibleCount} elegíveis agora).
          Clientes podem responder <strong>SAIR</strong> para não receber mais.
        </p>
        <form onSubmit={createCampaign} className="mt-4 grid gap-4">
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Nome da campanha</span>
            <input
              required
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Ex.: Promoção fim de semana"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Imagem da campanha</span>
            <input
              required
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              className="mt-1 w-full text-sm"
              onChange={(e) => void handleImageUpload(e.target.files?.[0] ?? null)}
            />
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Pré-visualização"
                className="mt-3 max-h-48 rounded-xl border border-[var(--card-border)] object-contain"
              />
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Texto (legenda)</span>
            <textarea
              required
              rows={4}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              value={campaignText}
              onChange={(e) => setCampaignText(e.target.value)}
            />
            <span className="mt-1 block text-xs text-vyria-navy-muted">
              Variável: {'{{nome}}'}
            </span>
          </label>
          <label className="block text-sm sm:max-w-xs">
            <span className="font-medium text-vyria-navy">Agendar (opcional)</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <span className="mt-1 block text-xs text-vyria-navy-muted">
              Deixe vazio para enviar em breve após criar.
            </span>
          </label>
          <button
            type="submit"
            disabled={saving || uploading || !imageUrl || !config.enabled || eligibleCount === 0}
            className="btn-vyria-gradient w-fit rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {scheduledAt ? 'Agendar campanha' : 'Criar e enviar campanha'}
          </button>
          {!config.enabled ? (
            <p className="text-xs text-amber-700">Active o marketing nas configurações acima.</p>
          ) : eligibleCount === 0 ? (
            <p className="text-xs text-amber-700">
              Sem contactos elegíveis. Aguarde mensagens no WhatsApp ou reduza o intervalo entre
              envios.
            </p>
          ) : null}
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Público elegível</h2>
        {audiencePreview.length === 0 ? (
          <p className="mt-3 text-sm text-vyria-navy-muted">Nenhum contacto elegível no momento.</p>
        ) : (
          <div className="mt-4 max-h-56 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-vyria-navy-muted">
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2">Telefone</th>
                </tr>
              </thead>
              <tbody>
                {audiencePreview.map((c) => (
                  <tr key={c.customer_phone} className="border-b border-[var(--card-border)]">
                    <td className="py-2 pr-4">{c.customer_name || '—'}</td>
                    <td className="py-2 font-mono text-xs">
                      {formatPhoneDisplay(c.customer_phone)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Contactos WhatsApp</h2>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Todos os clientes que enviaram mensagem são registados aqui.
        </p>
        {contacts.length === 0 ? (
          <p className="mt-3 text-sm text-vyria-navy-muted">Nenhum contacto ainda.</p>
        ) : (
          <div className="mt-4 max-h-56 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-vyria-navy-muted">
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Telefone</th>
                  <th className="py-2">Primeiro contacto</th>
                </tr>
              </thead>
              <tbody>
                {contacts.slice(0, 40).map((c) => (
                  <tr
                    key={'customer_phone' in c ? c.customer_phone : ''}
                    className="border-b border-[var(--card-border)]"
                  >
                    <td className="py-2 pr-4">{c.customer_name || '—'}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {formatPhoneDisplay(c.customer_phone)}
                    </td>
                    <td className="py-2 text-xs">{formatDate(c.first_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                    {statusLabel(c.status)} · {c.recipient_count} destinatários · {c.sent_count}{' '}
                    enviados
                    {c.failed_count > 0 ? ` · ${c.failed_count} falhas` : ''}
                  </p>
                  {c.scheduled_at ? (
                    <p className="mt-1 text-xs text-vyria-navy-muted">
                      Agendada: {formatDate(c.scheduled_at)}
                    </p>
                  ) : null}
                </div>
                {c.status === 'scheduled' ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void cancelCampaign(c.id)}
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
                  >
                    Cancelar
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
                  <span className="text-vyria-navy">
                    {s.customer_name || formatPhoneDisplay(s.customer_phone)}
                  </span>
                  {s.error_message ? (
                    <span className="ml-2 text-red-700">({s.error_message})</span>
                  ) : (
                    <span className="ml-2 text-emerald-700">(enviado)</span>
                  )}
                </div>
                <time className="text-xs text-vyria-navy-muted">
                  {formatDate(s.sent_at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
