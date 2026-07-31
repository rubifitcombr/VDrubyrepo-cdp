'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatPhoneDisplay } from '@/lib/loyalty/utils'
import type {
  InactiveCustomer,
  RecoveryCampaignRow,
  RecoveryPromotionOption,
  RecoveryReport,
  RecoverySendRow,
  StoreRecoveryConfig,
  WhatsAppContactSummary,
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

function sourceLabel(source: InactiveCustomer['source']): string {
  switch (source) {
    case 'whatsapp':
      return 'WhatsApp'
    case 'both':
      return 'Pedido + WhatsApp'
    default:
      return 'Pedido'
  }
}

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

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
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

export function RecuperadorMasterClient() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [config, setConfig] = useState<StoreRecoveryConfig | null>(null)
  const [report, setReport] = useState<RecoveryReport | null>(null)
  const [campaigns, setCampaigns] = useState<RecoveryCampaignRow[]>([])
  const [sends, setSends] = useState<RecoverySendRow[]>([])
  const [promotions, setPromotions] = useState<RecoveryPromotionOption[]>([])
  const [contacts, setContacts] = useState<WhatsAppContactSummary[]>([])
  const [messagePreview, setMessagePreview] = useState('')
  const [inactivePreview, setInactivePreview] = useState<InactiveCustomer[] | null>(null)

  const [campaignName, setCampaignName] = useState('')
  const [campaignDays, setCampaignDays] = useState('30')
  const [campaignTemplate, setCampaignTemplate] = useState('')
  const [offerMode, setOfferMode] = useState<'promo' | 'custom'>('promo')
  const [selectedPromoId, setSelectedPromoId] = useState<string>('')
  const [offerTitle, setOfferTitle] = useState('')
  const [offerDescription, setOfferDescription] = useState('')

  const load = useCallback(async (previewDays?: number) => {
    setLoading(true)
    setError(null)
    try {
      const qs =
        previewDays && previewDays >= 7 ? `?preview_days=${previewDays}&contacts_limit=80` : '?contacts_limit=80'
      const res = await fetch(`/api/master/recovery/config${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar.')
      setConfig(json.config)
      setReport(json.report)
      setCampaigns(json.campaigns ?? [])
      setSends(json.sends ?? [])
      setPromotions(json.promotions ?? [])
      setContacts(json.contacts ?? [])
      setMessagePreview(json.messagePreview ?? '')
      setInactivePreview(json.inactivePreview)

      if (json.config) {
        const cfg = json.config as StoreRecoveryConfig
        setCampaignDays(String(cfg.default_inactive_days))
        setCampaignTemplate((prev) => (prev ? prev : cfg.default_message_template))
        if (cfg.promotion_id) {
          setOfferMode('promo')
          setSelectedPromoId(cfg.promotion_id)
        } else if (cfg.offer_title || cfg.offer_description) {
          setOfferMode('custom')
          setOfferTitle(cfg.offer_title || '')
          setOfferDescription(cfg.offer_description || '')
        }
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

  const selectedPromo = useMemo(
    () => promotions.find((p) => p.id === selectedPromoId) ?? null,
    [promotions, selectedPromoId]
  )

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
      void load(Number(campaignDays))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar.')
    } finally {
      setSaving(false)
    }
  }

  async function saveOffer() {
    if (offerMode === 'promo') {
      await saveConfig({
        promotion_id: selectedPromoId || null,
        offer_title: null,
        offer_description: null,
      })
      return
    }
    await saveConfig({
      promotion_id: null,
      offer_title: offerTitle.trim() || null,
      offer_description: offerDescription.trim() || null,
    })
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
          promotion_id: offerMode === 'promo' ? selectedPromoId || null : null,
          offer_title: offerMode === 'custom' ? offerTitle.trim() || null : null,
          offer_description:
            offerMode === 'custom' ? offerDescription.trim() || null : null,
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
    const max = config?.max_sends_per_run ?? 50
    if (
      !confirm(
        `Enviar mensagens WhatsApp para clientes inactivos? (máx. ${max} por envio, respeitando intervalo de ${config?.cooldown_days ?? 7} dias)`
      )
    ) {
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

  if (loading && !config) {
    return <p className="text-sm text-vyria-navy-muted">A carregar recuperador…</p>
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

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Campanhas" value={String(report?.campaigns_total ?? 0)} />
        <StatCard label="Mensagens enviadas" value={String(report?.sends_total ?? 0)} />
        <StatCard label="Conversões" value={String(report?.conversions_total ?? 0)} />
        <StatCard
          label="Taxa de conversão"
          value={`${report?.conversion_rate_pct ?? 0}%`}
        />
        <StatCard
          label="Contactos WhatsApp"
          value={String(report?.whatsapp_contacts_total ?? 0)}
          hint="Registados automaticamente"
        />
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-brand text-lg font-bold text-vyria-navy">Relatório geral</h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              Receita atribuída a campanhas de recuperação nos últimos envios.
            </p>
          </div>
          <p className="font-brand text-xl font-bold text-violet-800">
            {money(report?.revenue_cents_total ?? 0)}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Estratégia de recuperação</h2>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Configure a oferta enviada a clientes sem actividade há{' '}
          <strong>{config.default_inactive_days} dias</strong>. O envio automático corre
          diariamente quando activo.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm font-medium text-vyria-navy">
            <input
              type="checkbox"
              checked={config.enabled}
              disabled={saving}
              onChange={(e) => void saveConfig({ enabled: e.target.checked })}
            />
            Recuperador activo
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-vyria-navy">
            <input
              type="checkbox"
              checked={config.auto_send_enabled}
              disabled={saving || !config.enabled}
              onChange={(e) => void saveConfig({ auto_send_enabled: e.target.checked })}
            />
            Envio automático diário
          </label>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Dias sem actividade</span>
            <input
              type="number"
              min={7}
              max={365}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              defaultValue={config.default_inactive_days}
              onBlur={(e) => {
                const days = Number(e.target.value)
                void saveConfig({ default_inactive_days: days })
                setCampaignDays(String(days))
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Intervalo entre envios (dias)</span>
            <input
              type="number"
              min={1}
              max={90}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              defaultValue={config.cooldown_days}
              onBlur={(e) => void saveConfig({ cooldown_days: Number(e.target.value) })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Máx. por envio</span>
            <input
              type="number"
              min={1}
              max={200}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              defaultValue={config.max_sends_per_run}
              onBlur={(e) => void saveConfig({ max_sends_per_run: Number(e.target.value) })}
            />
          </label>
        </div>

        <div className="mt-6 space-y-4">
          <p className="text-sm font-semibold text-vyria-navy">Oferta estratégica</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="offerMode"
                checked={offerMode === 'promo'}
                onChange={() => setOfferMode('promo')}
              />
              Promoção / combo do cardápio
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="offerMode"
                checked={offerMode === 'custom'}
                onChange={() => setOfferMode('custom')}
              />
              Anúncio personalizado
            </label>
          </div>

          {offerMode === 'promo' ? (
            <label className="block text-sm">
              <span className="font-medium text-vyria-navy">Selecionar promoção</span>
              <select
                className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                value={selectedPromoId}
                onChange={(e) => setSelectedPromoId(e.target.value)}
              >
                <option value="">— Escolha uma promoção —</option>
                {promotions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.active ? '✓ ' : '○ '}
                    {p.name}
                    {p.coupon_code ? ` (${p.coupon_code})` : ''}
                  </option>
                ))}
              </select>
              {selectedPromo ? (
                <span className="mt-2 block text-xs text-vyria-navy-muted">
                  {selectedPromo.summary}
                </span>
              ) : promotions.length === 0 ? (
                <span className="mt-2 block text-xs text-amber-700">
                  Crie promoções em Cardápio → Promoções para vincular aqui.
                </span>
              ) : null}
            </label>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-vyria-navy">Título da oferta</span>
                <input
                  className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                  value={offerTitle}
                  onChange={(e) => setOfferTitle(e.target.value)}
                  placeholder="Ex.: Combo família com 15% off"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-vyria-navy">Descrição / detalhes</span>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                  value={offerDescription}
                  onChange={(e) => setOfferDescription(e.target.value)}
                  placeholder="Válido até domingo. Inclui 2 pizzas + refrigerante 2L."
                />
              </label>
            </div>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={() => void saveOffer()}
            className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-60"
          >
            Guardar oferta
          </button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Modelo de mensagem</span>
            <textarea
              rows={5}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 font-mono text-sm"
              defaultValue={config.default_message_template}
              onBlur={(e) => void saveConfig({ default_message_template: e.target.value })}
            />
            <span className="mt-1 block text-xs text-vyria-navy-muted">
              Variáveis: {'{{nome}}'}, {'{{loja}}'}, {'{{link}}'}, {'{{dias}}'}, {'{{oferta}}'},{' '}
              {'{{promo}}'}, {'{{cupom}}'}
            </span>
          </label>
          <div className="text-sm">
            <span className="font-medium text-vyria-navy">Pré-visualização</span>
            <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--card-border)] bg-slate-50 px-3 py-3 text-xs leading-relaxed text-vyria-navy">
              {messagePreview || 'Guarde a oferta para ver a pré-visualização.'}
            </pre>
          </div>
        </div>

        {config.last_auto_run_at ? (
          <p className="mt-4 text-xs text-vyria-navy-muted">
            Último envio automático: {formatDate(config.last_auto_run_at)}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">
          Contactos WhatsApp
        </h2>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Todo cliente que enviar mensagem é registado com nome, telefone e data de entrada.
        </p>
        {contacts.length === 0 ? (
          <p className="mt-3 text-sm text-vyria-navy-muted">
            Ainda não há contactos. Ligue o WhatsApp e aguarde a primeira mensagem.
          </p>
        ) : (
          <div className="mt-4 max-h-72 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-vyria-navy-muted">
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Telefone</th>
                  <th className="py-2 pr-4">Primeiro contacto</th>
                  <th className="py-2">Última mensagem</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.customer_phone} className="border-b border-[var(--card-border)]">
                    <td className="py-2 pr-4">{c.customer_name || '—'}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {formatPhoneDisplay(c.customer_phone)}
                    </td>
                    <td className="py-2 pr-4 text-xs">{formatDate(c.first_seen_at)}</td>
                    <td className="py-2 text-xs">{formatDate(c.last_inbound_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-brand text-lg font-bold text-vyria-navy">
              Clientes inactivos — pré-visualização
            </h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              Sem pedido ou mensagem há mais de {config.default_inactive_days} dias.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(config.default_inactive_days)}
            className="rounded-xl border border-[var(--card-border)] px-3 py-2 text-xs font-semibold text-vyria-navy hover:bg-slate-50"
          >
            Actualizar lista
          </button>
        </div>
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
                  <th className="py-2 pr-4">Origem</th>
                  <th className="py-2">Inactivo há</th>
                </tr>
              </thead>
              <tbody>
                {inactivePreview.slice(0, 25).map((c) => (
                  <tr key={c.customer_phone} className="border-b border-[var(--card-border)]">
                    <td className="py-2 pr-4">{c.customer_name || '—'}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {formatPhoneDisplay(c.customer_phone)}
                    </td>
                    <td className="py-2 pr-4 text-xs">{sourceLabel(c.source)}</td>
                    <td className="py-2">{c.days_inactive} dias</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {inactivePreview.length > 25 ? (
              <p className="mt-2 text-xs text-vyria-navy-muted">
                + {inactivePreview.length - 25} clientes elegíveis
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Campanha manual</h2>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Dispare agora para clientes inactivos, usando a oferta configurada acima.
        </p>
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
                  <p className="font-semibold text-vyria-navy">
                    {c.name}
                    {c.is_automatic ? (
                      <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                        automático
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-vyria-navy-muted">
                    {statusLabel(c.status)} · {c.inactive_days} dias · {c.sent_count} envios ·{' '}
                    {c.converted_count} conversões
                  </p>
                </div>
                {c.status === 'draft' ? (
                  <button
                    type="button"
                    disabled={saving || !config.enabled}
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
        {!config.enabled ? (
          <p className="mt-3 text-xs text-amber-700">
            Active o recuperador para poder enviar campanhas.
          </p>
        ) : null}
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
                  ) : s.converted_at ? (
                    <span className="ml-2 text-emerald-700">(convertido)</span>
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
