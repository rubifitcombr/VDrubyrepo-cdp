'use client'

import { useCallback, useEffect, useState } from 'react'
import { WhatsAppEmbeddedConnect } from './WhatsAppEmbeddedConnect'
import { WhatsAppPendingActivation, readJsonResponse } from './WhatsAppPendingActivation'
import { WhatsAppSetupGuide } from './WhatsAppSetupGuide'
import type {
  StoreWhatsAppConfigPublic,
  WhatsAppAiTone,
  WhatsAppMessageRow,
} from '@/lib/whatsapp/types'

type VerifiedWhatsAppSender = {
  phone_number_id: string
  display_phone_e164: string | null
  display_phone_formatted: string | null
  verified_name: string | null
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case 'active':
      return 'Activo'
    case 'disconnected':
      return 'Desligado'
    case 'error':
      return 'Erro'
    case 'pending':
      return 'Aguardando Vyria'
    default:
      return 'Não iniciado'
  }
}

function statusClass(status: string | undefined): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    case 'error':
      return 'bg-red-50 text-red-800 ring-red-200'
    case 'disconnected':
      return 'bg-zinc-100 text-zinc-600 ring-zinc-200'
    case 'pending':
      return 'bg-amber-50 text-amber-900 ring-amber-200'
    default:
      return 'bg-violet-50 text-violet-900 ring-violet-200'
  }
}

function OnboardingSteps({
  hasRequest,
  isActive,
  embeddedAvailable,
}: {
  hasRequest: boolean
  isActive: boolean
  embeddedAvailable?: boolean
}) {
  const steps = embeddedAvailable
    ? [
        { label: 'Conectar com Facebook', done: isActive, active: !isActive && !hasRequest },
        { label: 'Confirmar no celular', done: isActive, active: hasRequest && !isActive },
        { label: 'Testar e activar robô', done: false, active: isActive },
      ]
    : [
        { label: 'Solicitar activação', done: hasRequest || isActive },
        { label: 'Vyria configura na Meta', done: isActive, active: hasRequest && !isActive },
        { label: 'Testar e activar robô', done: false, active: isActive },
      ]
  return (
    <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-0">
      {steps.map((step, i) => (
        <li
          key={step.label}
          className={`flex flex-1 items-center gap-2 text-xs sm:flex-col sm:items-start sm:px-2 ${
            i < steps.length - 1 ? 'sm:border-r sm:border-[var(--card-border)]' : ''
          }`}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              step.done
                ? 'bg-emerald-600 text-white'
                : step.active
                  ? 'bg-vyria-plum text-white'
                  : 'bg-zinc-200 text-zinc-600'
            }`}
          >
            {step.done ? '✓' : i + 1}
          </span>
          <span
            className={
              step.done || step.active ? 'font-semibold text-vyria-navy' : 'text-vyria-navy-muted'
            }
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function templateStatusClass(status: string): string {
  switch (status) {
    case 'approved':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    case 'rejected':
      return 'bg-red-50 text-red-800 ring-red-200'
    default:
      return 'bg-amber-50 text-amber-900 ring-amber-200'
  }
}

function templateStatusLabel(status: string): string {
  switch (status) {
    case 'approved':
      return 'Aprovado'
    case 'rejected':
      return 'Rejeitado'
    default:
      return 'Em análise (Meta)'
  }
}

export function WhatsAppMasterClient({
  supportHref = null,
}: {
  supportHref?: string | null
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [config, setConfig] = useState<StoreWhatsAppConfigPublic | null>(null)
  const [verifiedSender, setVerifiedSender] = useState<VerifiedWhatsAppSender | null>(null)
  const [messages, setMessages] = useState<WhatsAppMessageRow[]>([])
  const [sendFailureStats, setSendFailureStats] = useState({
    window_expired_24h: 0,
    other_errors_24h: 0,
  })
  const [sendFailures, setSendFailures] = useState<
    Array<{
      id: string
      customer_phone_display: string
      flow_label: string
      message_type: string
      error_code: number | null
      error_message: string
      is_window_expired: boolean
      created_at: string
    }>
  >([])
  const [templates, setTemplates] = useState<
    Array<{
      id: string
      template_name: string
      template_label: string
      category: string
      status: string
      rejection_reason: string | null
      updated_at: string
      fallback_count_7d: number
    }>
  >([])
  const [testPhone, setTestPhone] = useState('')
  const [embeddedAvailable, setEmbeddedAvailable] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/master/whatsapp/config')
      const json = await readJsonResponse(res)
      if (!res.ok) throw new Error(String(json.error || 'Falha ao carregar.'))
      setConfig((json.config as StoreWhatsAppConfigPublic | null) ?? null)
      setVerifiedSender((json.verifiedSender as VerifiedWhatsAppSender | null) ?? null)
      setMessages((json.messages as WhatsAppMessageRow[]) ?? [])
      setSendFailureStats(
        (json.sendFailureStats as { window_expired_24h: number; other_errors_24h: number }) ?? {
          window_expired_24h: 0,
          other_errors_24h: 0,
        }
      )
      setSendFailures((json.sendFailures as typeof sendFailures) ?? [])
      setTemplates((json.templates as typeof templates) ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/master/whatsapp/embedded-config')
        const json = await res.json()
        if (!cancelled) setEmbeddedAvailable(res.ok && json.available === true)
      } catch {
        if (!cancelled) setEmbeddedAvailable(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const isActive = config?.status === 'active'
  const hasActivationRequest = Boolean(config?.onboarding_requested_at)
  const displayStatus = config?.status ?? (hasActivationRequest ? 'pending' : undefined)

  /** Enquanto aguarda Vyria, actualiza a cada 45s para reflectir activação pelo admin. */
  useEffect(() => {
    if (isActive || !hasActivationRequest) return
    const poll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void load()
    }, 45_000)
    return () => window.clearInterval(poll)
  }, [isActive, hasActivationRequest, load])

  async function patchSettings(patch: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/master/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'settings', ...patch }),
      })
      const json = await readJsonResponse(res)
      if (!res.ok) throw new Error(String(json.error || 'Falha ao guardar.'))
      setConfig(json.config as StoreWhatsAppConfigPublic)
      setSuccess('Configurações guardadas.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestSend() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/master/whatsapp/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testPhone }),
      })
      const json = await readJsonResponse(res)
      if (!res.ok) throw new Error(String(json.error || 'Falha no envio.'))
      const fromLabel =
        String(json.from_phone || '') ||
        String(json.phone_number_id || '') ||
        verifiedSender?.display_phone_formatted ||
        'número ligado'
      const nameSuffix = json.from_name ? ` (${String(json.from_name)})` : ''
      setSuccess(`Mensagem enviada pelo número ${fromLabel}${nameSuffix}.`)
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro no envio.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-vyria-navy-muted">A carregar…</p>
  }

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

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-brand text-lg font-bold text-vyria-navy">Ligação WhatsApp</h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              {embeddedAvailable
                ? 'Ligue o número Business com coexistência — continue a usar o app no celular.'
                : 'A equipa Vyria configura a ligação com a Meta no seu número Business.'}
            </p>
          </div>
          {displayStatus !== undefined || !config ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClass(displayStatus)}`}
            >
              {statusLabel(displayStatus)}
            </span>
          ) : null}
        </div>

        {!isActive ? (
          <OnboardingSteps
            hasRequest={hasActivationRequest}
            isActive={isActive}
            embeddedAvailable={embeddedAvailable === true}
          />
        ) : null}

        {config?.status === 'error' && config.last_error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {config.last_error}
          </p>
        ) : null}

        <div className="mt-6">
          <WhatsAppSetupGuide
            isConnected={isActive}
            supportHref={supportHref}
            coexistenceMode={embeddedAvailable !== false}
          />
        </div>

        {!isActive ? (
          <div className="mt-6 space-y-6">
            {embeddedAvailable ? (
              <WhatsAppEmbeddedConnect
                disabled={saving}
                supportHref={supportHref}
                onConnected={() => {
                  setSuccess(
                    'WhatsApp ligado com coexistência! Active o robô abaixo e envie «oi» para testar.'
                  )
                  setError(null)
                  void load()
                }}
                onError={setError}
              />
            ) : null}

            <details className="rounded-2xl border border-[var(--card-border)] bg-zinc-50/80 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-vyria-navy">
                {embeddedAvailable
                  ? 'Prefere que a Vyria configure por si?'
                  : 'Solicitar activação pela Vyria'}
              </summary>
              <div className="mt-4">
                <WhatsAppPendingActivation
                  disabled={saving}
                  supportHref={supportHref}
                  initialContactPhone={config?.onboarding_contact_phone ?? ''}
                  initialNotes={config?.onboarding_notes ?? ''}
                  requestedAt={config?.onboarding_requested_at ?? null}
                  onSubmitted={() => {
                    setSuccess('Pedido enviado! A Vyria activará o WhatsApp em breve.')
                    setError(null)
                    void load()
                  }}
                  onError={setError}
                />
              </div>
            </details>
          </div>
        ) : null}

        {isActive && config ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950">
              <p className="font-semibold">Número de envio (confirmado pela Meta)</p>
              <p className="mt-1 font-mono text-xs">
                {verifiedSender?.display_phone_formatted ||
                  verifiedSender?.display_phone_e164 ||
                  config.display_phone_e164 ||
                  config.phone_number_id ||
                  '—'}
              </p>
              {verifiedSender?.verified_name ? (
                <p className="mt-1 text-xs text-emerald-800">
                  Nome verificado: {verifiedSender.verified_name}
                </p>
              ) : null}
              {verifiedSender?.phone_number_id ? (
                <p className="mt-1 text-xs text-emerald-800/80">
                  Phone Number ID: {verifiedSender.phone_number_id}
                </p>
              ) : null}
              {config.webhook_verified_at ? (
                <p className="mt-2 text-xs text-emerald-800">
                  Última actividade:{' '}
                  {new Date(config.webhook_verified_at).toLocaleString('pt-BR')}
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-900">
                  Envie uma mensagem de teste abaixo para confirmar a ligação.
                </p>
              )}
            </div>
            <p className="text-xs text-vyria-navy-muted">
              Para alterar o número ou desligar, contacte o{' '}
              {supportHref ? (
                <a
                  href={supportHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-vyria-plum hover:underline"
                >
                  suporte Vyria
                </a>
              ) : (
                'suporte Vyria'
              )}
              .
            </p>
          </div>
        ) : null}
      </section>

      {isActive && config ? (
        <>
          <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
            <h2 className="font-brand text-lg font-bold text-vyria-navy">Atendimento automático</h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              Menu interactivo no WhatsApp: status do pedido, horários, fidelidade e link do
              cardápio. Pedidos são feitos somente pelo cardápio online. Active o robô e envie
              «oi» do seu celular para testar.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.auto_reply_enabled}
                  disabled={saving}
                  onChange={(e) =>
                    void patchSettings({ auto_reply_enabled: e.target.checked })
                  }
                />
                Atendimento automático activo
              </label>
              <label className="text-sm">
                <span className="mr-2 font-medium">Tom</span>
                <select
                  className="rounded-lg border border-[var(--card-border)] px-2 py-1.5 text-sm"
                  value={config.ai_tone}
                  disabled={saving}
                  onChange={(e) =>
                    void patchSettings({ ai_tone: e.target.value as WhatsAppAiTone })
                  }
                >
                  <option value="casual">Casual</option>
                  <option value="formal">Formal</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
            <h2 className="font-brand text-lg font-bold text-vyria-navy">
              Notificações de pedido
            </h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              O sistema avisa o cliente automaticamente em cada etapa do pedido (recebido, aceite,
              preparação, saiu para entrega e entregue).
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['notify_order_received', 'Pedido recebido'],
                  ['notify_order_preparing', 'Aceito / em preparação'],
                  ['notify_order_ready', 'Saiu para entrega'],
                  ['notify_order_delivered', 'Entregue (sem fidelidade)'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config[key]}
                    disabled={saving}
                    onChange={(e) => void patchSettings({ [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
            <h2 className="font-brand text-lg font-bold text-vyria-navy">Templates de mensagem</h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              Modelos em português (pt_BR) criados pela Vyria na activação. A Meta pode levar algumas
              horas a aprovar — notificações automáticas usam estes modelos fora da janela de 24h.
            </p>
            {templates.length === 0 ? (
              <p className="mt-4 text-sm text-vyria-navy-muted">
                Ainda sem templates registados. Se acabou de activar, aguarde alguns minutos ou
                contacte o suporte Vyria.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--card-border)]">
                {templates.map((t) => (
                  <li key={t.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-vyria-navy">{t.template_label}</p>
                        <p className="mt-0.5 font-mono text-xs text-vyria-navy-muted">
                          {t.template_name}
                          <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600">
                            {t.category}
                          </span>
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${templateStatusClass(t.status)}`}
                      >
                        {templateStatusLabel(t.status)}
                      </span>
                    </div>
                    {t.status === 'rejected' && t.rejection_reason ? (
                      <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                        {t.rejection_reason}
                      </p>
                    ) : null}
                    {t.status === 'approved' && t.fallback_count_7d > 0 ? (
                      <p className="mt-2 text-xs text-emerald-800">
                        {t.fallback_count_7d}{' '}
                        {t.fallback_count_7d === 1
                          ? 'mensagem entregue via template'
                          : 'mensagens entregues via template'}{' '}
                        nos últimos 7 dias (fora da janela de 24h)
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-vyria-navy-muted">
                      Atualizado: {new Date(t.updated_at).toLocaleString('pt-BR')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
            <h2 className="font-brand text-lg font-bold text-vyria-navy">Testar ligação</h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              Envie uma mensagem de teste. Depois mande «oi» do seu celular para o número da loja e
              confira o atendimento automático (robô).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                className="min-w-[12rem] flex-1 rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="Seu celular com DDD (ex: 62999887766)"
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleTestSend()}
                className="btn-vyria-gradient rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                Enviar teste
              </button>
            </div>
          </section>
        </>
      ) : null}

      {isActive ? (
        <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
          <h2 className="font-brand text-lg font-bold text-vyria-navy">Falhas de envio</h2>
          <p className="mt-1 text-sm text-vyria-navy-muted">
            Últimas 24 horas — inclui rejeições da Meta (ex.: janela de 24h expirada, código 131047).
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                Janela expirada
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-950">
                {sendFailureStats.window_expired_24h}
              </p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-900">
                Outros erros
              </p>
              <p className="mt-1 text-2xl font-bold text-red-950">
                {sendFailureStats.other_errors_24h}
              </p>
            </div>
          </div>
          {sendFailures.length === 0 ? (
            <p className="mt-4 text-sm text-vyria-navy-muted">
              Nenhuma falha registada recentemente.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--card-border)]">
              {sendFailures.map((f) => (
                <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-vyria-navy-muted">
                        {f.customer_phone_display}
                      </span>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700">
                        {f.flow_label}
                      </span>
                      {f.is_window_expired ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
                          Janela 24h
                        </span>
                      ) : null}
                      {f.error_code != null ? (
                        <span className="text-xs text-vyria-navy-muted">#{f.error_code}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-vyria-navy">{f.error_message}</p>
                  </div>
                  <time className="shrink-0 text-xs text-vyria-navy-muted">
                    {new Date(f.created_at).toLocaleString('pt-BR')}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {!isActive ? (
        <section className="rounded-2xl border border-dashed border-[var(--card-border)] bg-zinc-50/80 p-6">
          <h2 className="font-brand text-lg font-bold text-vyria-navy">Robô e mensagens</h2>
          <p className="mt-2 text-sm text-vyria-navy-muted">
            Após a Vyria activar o seu número, você poderá:
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-vyria-navy-muted">
            <li>Activar o atendimento automático (menu de pedidos, cardápio, fidelidade)</li>
            <li>Ligar notificações de status do pedido</li>
            <li>Enviar mensagem de teste e ver o histórico aqui</li>
          </ul>
        </section>
      ) : (
        <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
          <h2 className="font-brand text-lg font-bold text-vyria-navy">Mensagens recentes</h2>
          {messages.length === 0 ? (
            <p className="mt-3 text-sm text-vyria-navy-muted">
              Nenhuma mensagem ainda. Envie «oi» para o número da loja ou use o teste acima.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--card-border)]">
              {messages.map((m) => (
                <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                  <div>
                    <span
                      className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${
                        m.direction === 'inbound'
                          ? 'bg-violet-100 text-violet-800'
                          : 'bg-sky-100 text-sky-800'
                      }`}
                    >
                      {m.direction === 'inbound' ? 'Recebida' : 'Enviada'}
                    </span>
                    <span className="text-vyria-navy">{m.body_text || `(${m.message_type})`}</span>
                  </div>
                  <time className="text-xs text-vyria-navy-muted">
                    {new Date(m.created_at).toLocaleString('pt-BR')}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
