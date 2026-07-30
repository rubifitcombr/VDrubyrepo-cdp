'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { WhatsAppEmbeddedConnect } from './WhatsAppEmbeddedConnect'
import { WhatsAppSetupGuide } from './WhatsAppSetupGuide'
import type {
  StoreWhatsAppConfigPublic,
  WhatsAppAiTone,
  WhatsAppMessageRow,
} from '@/lib/whatsapp/types'

function statusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Activo'
    case 'disconnected':
      return 'Desligado'
    case 'error':
      return 'Erro'
    default:
      return 'Pendente'
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    case 'error':
      return 'bg-red-50 text-red-800 ring-red-200'
    case 'disconnected':
      return 'bg-zinc-100 text-zinc-600 ring-zinc-200'
    default:
      return 'bg-amber-50 text-amber-900 ring-amber-200'
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
  const [messages, setMessages] = useState<WhatsAppMessageRow[]>([])
  const [testPhone, setTestPhone] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/master/whatsapp/config')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar.')
      setConfig(json.config ?? null)
      setMessages(json.messages ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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

  async function handleDisconnect() {
    if (!confirm('Desligar o WhatsApp desta loja? Poderá voltar a conectar com Facebook.')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/master/whatsapp/disconnect', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao desligar.')
      setSuccess('WhatsApp desligado.')
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao desligar.')
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
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha no envio.')
      setSuccess('Mensagem de teste enviada.')
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
              Um clique com Facebook — a Vyria configura tudo automaticamente.
            </p>
          </div>
          {config ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClass(config.status)}`}
            >
              {statusLabel(config.status)}
            </span>
          ) : null}
        </div>

        <div className="mt-6">
          <WhatsAppSetupGuide
            isConnected={config?.status === 'active'}
            supportHref={supportHref}
          />
        </div>

        {config?.status !== 'active' ? (
          <div className="mt-6">
            <WhatsAppEmbeddedConnect
              disabled={saving}
              supportHref={supportHref}
              onConnected={() => {
                setSuccess('WhatsApp ligado com sucesso! Envie um teste para confirmar.')
                setError(null)
                void load()
              }}
              onError={setError}
            />
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950">
              <p className="font-semibold">Número ligado</p>
              <p className="mt-1 font-mono text-xs">
                {config.display_phone_e164 || config.phone_number_id || '—'}
              </p>
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
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleDisconnect()}
              className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-50"
            >
              Desligar e conectar outro número
            </button>
          </div>
        )}
      </section>

      {config?.status === 'active' ? (
        <>
          <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
            <h2 className="font-brand text-lg font-bold text-vyria-navy">Robô IA (básico)</h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              Respostas automáticas para «oi», «menu» e «pedido».
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.ai_enabled}
                  disabled={saving}
                  onChange={(e) => void patchSettings({ ai_enabled: e.target.checked })}
                />
                Robô activo
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
              Em breve — já pode activar os avisos.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['notify_order_received', 'Pedido recebido'],
                  ['notify_order_preparing', 'Em preparação'],
                  ['notify_order_ready', 'Pronto / a caminho'],
                  ['notify_order_delivered', 'Entregue'],
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
            <h2 className="font-brand text-lg font-bold text-vyria-navy">Testar ligação</h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              Envie uma mensagem para o seu celular ou mande «oi» para o número da loja.
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

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Mensagens recentes</h2>
        {messages.length === 0 ? (
          <p className="mt-3 text-sm text-vyria-navy-muted">Nenhuma mensagem registada.</p>
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

      <p className="text-center text-sm text-vyria-navy-muted">
        <Link href="/dashboard/master" className="font-semibold text-vyria-plum hover:underline">
          ← Voltar ao hub Master
        </Link>
      </p>
    </div>
  )
}
