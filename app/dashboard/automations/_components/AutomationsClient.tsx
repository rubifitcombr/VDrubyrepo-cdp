'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Plan } from '@/lib/plan'
import { hasAutomationAccess, hasOrderPipelineAutomations } from '@/lib/plan'
import type {
  StoreAutomationKey,
  StoreAutomationsState,
} from '@/lib/store-automations'
import { updateStore } from '@/services/store'
import { upsertWhatsAppAutomation } from '@/services/whatsapp-automations'
import {
  connectWhatsAppInstance,
  deleteWhatsAppInstance,
  getWhatsAppInstanceStatus,
  logoutWhatsAppInstance,
} from '@/services/whatsapp-instance'
import { IconBolt, IconBell } from '@/app/dashboard/_components/NavIcons'

function IconChat({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337L5.05 21l1.395-3.72C5.512 15.042 5 13.574 5 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
      />
    </svg>
  )
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function AutomationSwitch({
  on,
  disabled,
  onToggle,
  label,
}: {
  on: boolean
  disabled: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-primary)]/35 disabled:opacity-50 ${
        on ? 'bg-[var(--dash-primary)]' : 'bg-[#d1d5db]'
      }`}
    >
      <span
        className={`pointer-events-none absolute top-1 left-1 block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

const ROWS: Array<{
  key: StoreAutomationKey
  title: string
  description: string
  Icon: (p: { className?: string }) => ReactNode
}> = [
  {
    key: 'auto_whatsapp_confirm',
    title: 'Mensagem de confirmação',
    description:
      'Enviar mensagem automática no WhatsApp quando o pedido for confirmado.',
    Icon: IconChat,
  },
  {
    key: 'auto_accept_orders',
    title: 'Aceitar pedidos automaticamente',
    description:
      'Aceitar novos pedidos automaticamente dentro do horário de funcionamento.',
    Icon: IconBolt,
  },
  {
    key: 'auto_notify_new_order',
    title: 'Notificação de novo pedido',
    description:
      'Tocar som e enviar notificação push quando um novo pedido chegar.',
    Icon: IconBell,
  },
  {
    key: 'auto_close_outside_hours',
    title: 'Fechar loja automaticamente',
    description:
      'Fechar a loja automaticamente fora do horário de funcionamento.',
    Icon: IconClock,
  },
  {
    key: 'auto_whatsapp_delivery',
    title: 'Mensagem de entrega',
    description: 'Avisar o cliente quando o pedido sair para entrega.',
    Icon: IconChat,
  },
]

export function AutomationsClient({
  storeId,
  storeSlug,
  storePlan,
  initial,
  initialWhatsappAutomation,
}: {
  storeId: string
  storeSlug: string
  storePlan: Plan
  initial: StoreAutomationsState
  initialWhatsappAutomation: {
    is_active: boolean
    message_template: string
    delay_seconds: number
  }
}) {
  const [values, setValues] = useState<StoreAutomationsState>(initial)
  const [savingKey, setSavingKey] = useState<StoreAutomationKey | null>(null)
  const [waSaving, setWaSaving] = useState(false)
  const [waConfig, setWaConfig] = useState(initialWhatsappAutomation)
  const [connectionState, setConnectionState] = useState<string>('unknown')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrKeepUntil, setQrKeepUntil] = useState<number>(0)
  const [qrCountdown, setQrCountdown] = useState<number>(0)
  const [instanceLoading, setInstanceLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasAccess = hasAutomationAccess(storePlan)
  const canUseOrderAutomations = hasOrderPipelineAutomations(storePlan)

  function normalizeConnectionState(value: unknown): string {
    if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase()
    return 'unknown'
  }

  const isConnected = connectionState === 'open'
  const statusLabel = isConnected
    ? 'Conectado'
    : connectionState === 'connecting'
      ? 'Conectando'
      : 'Desconectado'

  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://seudominio.com'
  const previewLink = `${origin}/${storeSlug || 'minhaloja'}`
  const previewText = (waConfig.message_template || '').replaceAll(
    '{link}',
    previewLink
  )

  async function toggle(key: StoreAutomationKey) {
    const next = !values[key]
    const prev = values[key]
    setValues((v) => ({ ...v, [key]: next }))
    setError(null)
    setSavingKey(key)
    const { error: upErr } = await updateStore(storeId, { [key]: next })
    setSavingKey(null)
    if (upErr) {
      setValues((v) => ({ ...v, [key]: prev }))
      const msg = upErr.message || ''
      setError(
        /auto_whatsapp|auto_accept|auto_notify|auto_close|column/i.test(msg) ||
          upErr.code === 'PGRST204'
          ? 'Executa o script scripts/supabase-store-automations.sql no Supabase.'
          : msg || 'Não foi possível guardar.'
      )
    }
  }

  async function saveWhatsAppAutomation() {
    if (!hasAccess) return
    setError(null)
    setWaSaving(true)
    const template = waConfig.message_template.trim()
    const delay = Math.max(0, Math.min(300, Number(waConfig.delay_seconds) || 0))
    const { error: upErr } = await upsertWhatsAppAutomation(storeId, {
      is_active: waConfig.is_active,
      message_template:
        template || 'Olá 👋 faça seu pedido aqui: {link}',
      delay_seconds: delay,
    })
    setWaSaving(false)
    if (upErr) {
      const msg = upErr.message || ''
      setError(
        /whatsapp_automations|column|relation|policy/i.test(msg) ||
          upErr.code === 'PGRST204'
          ? 'Executa o script supabase/phase4-whatsapp-automations.sql no Supabase.'
          : msg || 'Não foi possível salvar automação do WhatsApp.'
      )
      return
    }
    setWaConfig((prev) => ({
      ...prev,
      message_template:
        template || 'Olá 👋 faça seu pedido aqui: {link}',
      delay_seconds: delay,
    }))
  }

  async function refreshInstanceStatus(includeQr = false) {
    setError(null)
    try {
      const data = await getWhatsAppInstanceStatus(storeId, includeQr)
      setConnectionState(normalizeConnectionState(data.connectionState))
      const now = Date.now()
      if (data.qrCode) {
        setQrCode(data.qrCode)
        setQrKeepUntil(now + 30_000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao consultar instância.')
    }
  }

  async function handleGenerateQr() {
    setError(null)
    setInstanceLoading(true)
    try {
      const data = await connectWhatsAppInstance(storeId)
      setConnectionState(normalizeConnectionState(data.connectionState))
      setQrCode(data.qrCode)
      setQrKeepUntil(Date.now() + 30_000)
      if (!data.qrCode && data.connectionState !== 'open') {
        setError('QR Code não retornado pela Evolution. Tenta novamente em alguns segundos.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar QR Code.')
    } finally {
      setInstanceLoading(false)
    }
  }

  async function handleLogoutWhatsApp() {
    setError(null)
    setInstanceLoading(true)
    try {
      const data = await logoutWhatsAppInstance(storeId)
      setConnectionState(normalizeConnectionState(data.connectionState))
      setQrCode(null)
      setQrKeepUntil(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desligar sessão.')
    } finally {
      setInstanceLoading(false)
    }
  }

  async function handleDeleteWhatsAppInstance() {
    const ok = window.confirm(
      'Isto remove a instância na Evolution API (sessão e dados locais dessa instância). ' +
        'Depois podes voltar a gerar o QR Code para criar de novo. Continuar?'
    )
    if (!ok) return
    setError(null)
    setInstanceLoading(true)
    try {
      const data = await deleteWhatsAppInstance(storeId)
      setConnectionState(normalizeConnectionState(data.connectionState))
      setQrCode(null)
      setQrKeepUntil(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover instância.')
    } finally {
      setInstanceLoading(false)
    }
  }

  useEffect(() => {
    void refreshInstanceStatus(false)
    // storeId é estável por página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshInstanceStatus(false)
    }, 5000)
    return () => clearInterval(timer)
    // refresh contínuo apenas para estado da conexão
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  useEffect(() => {
    if (!qrCode || qrKeepUntil <= Date.now()) return
    const timeoutMs = qrKeepUntil - Date.now()
    const timer = setTimeout(() => setQrCode(null), timeoutMs)
    return () => clearTimeout(timer)
  }, [qrCode, qrKeepUntil])

  useEffect(() => {
    if (!qrCode) {
      setQrCountdown(0)
      return
    }
    const tick = () => {
      const leftMs = qrKeepUntil - Date.now()
      setQrCountdown(Math.max(0, Math.ceil(leftMs / 1000)))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [qrCode, qrKeepUntil])

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div>
        <h1 className="font-brand text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
          Automações
        </h1>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          {canUseOrderAutomations ? (
            <>
              As opções de pedidos e loja abaixo são aplicadas quando o backend processa o
              pedido (fila assíncrona). Garante que o telefone da loja e as políticas do
              WhatsApp Business estão corretos para evitar falhas de entrega.
            </>
          ) : (
            <>
              No plano Growth, configura aqui a instância WhatsApp e a resposta automática com o
              link do cardápio. As automações de pedidos (confirmação, aceitar automaticamente,
              notificações, horário…) estão disponíveis a partir do plano Pro.
            </>
          )}
        </p>
      </div>

      {!canUseOrderAutomations ? (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <span className="font-semibold">Queres mais automações?</span>{' '}
          Faz upgrade para Pro para ativar confirmação de pedido, aceitar pedidos,
          notificações e mais.{' '}
          <Link
            href="/dashboard/planos"
            className="font-semibold text-[var(--dash-primary)] underline underline-offset-2 hover:no-underline"
          >
            Ver planos
          </Link>
        </div>
      ) : null}

      {error ? (
        <p
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {canUseOrderAutomations ? (
        <ul className="mt-8 flex flex-col gap-4">
          {ROWS.map(({ key, title, description, Icon }) => (
            <li
              key={key}
              className="flex items-center gap-4 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm shadow-vyria-navy-deep/[0.04] sm:gap-5 sm:p-5"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--dash-primary)]/12 text-[var(--dash-primary)]"
                aria-hidden
              >
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-vyria-navy">{title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-vyria-navy-muted">
                  {description}
                </p>
              </div>
              <AutomationSwitch
                on={values[key]}
                disabled={savingKey !== null}
                onToggle={() => toggle(key)}
                label={title}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <section
        className={`rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-vyria-navy-deep/[0.04] sm:p-6 ${
          canUseOrderAutomations ? 'mt-8' : 'mt-6'
        }`}
      >
        <div className="mb-6 rounded-xl border border-[var(--card-border)] bg-[#f9fafb] p-4">
          <h2 className="font-semibold text-vyria-navy">Conexão da instância WhatsApp</h2>
          <p className="mt-1 text-sm text-vyria-navy-muted">
            Cada logista usa a própria instância da Evolution. Gere o QR Code para conectar
            este número da loja. Usa <strong className="font-medium">Desligar</strong> para
            terminar a sessão ou <strong className="font-medium">Remover</strong> para apagar
            a instância na Evolution e voltar a ligar com um QR novo.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                isConnected
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {statusLabel}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setInstanceLoading(true)
                void refreshInstanceStatus(false).finally(() => setInstanceLoading(false))
              }}
              disabled={instanceLoading}
              className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-vyria-navy hover:bg-[#f3f4f6] disabled:opacity-50"
            >
              {instanceLoading ? 'A carregar…' : 'Atualizar status'}
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateQr()}
              disabled={instanceLoading}
              className="rounded-lg bg-[var(--dash-primary)] px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-[var(--dash-primary)]/20 hover:brightness-105 disabled:opacity-50"
            >
              {instanceLoading ? 'A gerar…' : 'Gerar/Atualizar QR Code'}
            </button>
            <button
              type="button"
              onClick={() => void handleLogoutWhatsApp()}
              disabled={instanceLoading}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              Desligar
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteWhatsAppInstance()}
              disabled={instanceLoading}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
            >
              Remover
            </button>
          </div>
          {qrCode ? (
            <div className="mt-4">
              <p className="text-xs text-vyria-navy-muted">
                Escaneia este QR no WhatsApp do logista.
                {qrCountdown > 0 ? ` Expira em ${qrCountdown}s.` : ''}
              </p>
              <Image
                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR Code de conexão WhatsApp"
                width={224}
                height={224}
                unoptimized
                className="mt-2 h-56 w-56 rounded-xl border border-[var(--card-border)] bg-white p-2"
              />
            </div>
          ) : null}
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-vyria-navy">
              Resposta automática no WhatsApp
            </h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              Responde automaticamente com o link do cardápio quando receber nova mensagem no
              WhatsApp do cliente. Incluído no plano Growth.
            </p>
          </div>
          {!hasAccess ? (
            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              Incluído no Growth ou superior
            </span>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between rounded-xl border border-[var(--card-border)] bg-[#f9fafb] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-vyria-navy">Ativar automação</p>
            <p className="text-xs text-vyria-navy-muted">
              Só responde quando esta opção estiver ligada.
            </p>
          </div>
          <AutomationSwitch
            on={waConfig.is_active}
            disabled={!hasAccess || waSaving || savingKey !== null}
            onToggle={() =>
              setWaConfig((prev) => ({ ...prev, is_active: !prev.is_active }))
            }
            label="Ativar resposta automática no WhatsApp"
          />
        </div>

        <div className="mt-4 grid gap-4">
          <label className="block text-sm font-medium text-vyria-navy">
            Template da mensagem
            <textarea
              value={waConfig.message_template}
              onChange={(e) =>
                setWaConfig((prev) => ({
                  ...prev,
                  message_template: e.target.value,
                }))
              }
              disabled={!hasAccess || waSaving}
              rows={4}
              className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm text-vyria-navy outline-none transition-all focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/12 disabled:opacity-60"
              placeholder="Olá 👋 faça seu pedido aqui: {link}"
            />
            <p className="mt-1 text-xs text-vyria-navy-muted">
              Use <code>{'{link}'}</code> para inserir o link do cardápio
              automaticamente.
            </p>
          </label>

          <label className="block text-sm font-medium text-vyria-navy">
            Delay da resposta (segundos)
            <input
              type="number"
              min={0}
              max={300}
              step={1}
              value={waConfig.delay_seconds}
              onChange={(e) =>
                setWaConfig((prev) => ({
                  ...prev,
                  delay_seconds: Number(e.target.value),
                }))
              }
              disabled={!hasAccess || waSaving}
              className="mt-2 w-32 rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-sm text-vyria-navy outline-none transition-all focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/12 disabled:opacity-60"
            />
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--card-border)] bg-[#f9fafb] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
            Preview
          </p>
          <p className="mt-2 whitespace-pre-line text-sm text-vyria-navy">
            {previewText || `Olá 👋 faça seu pedido aqui: ${previewLink}`}
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={!hasAccess || waSaving}
            onClick={() => void saveWhatsAppAutomation()}
            className="rounded-xl bg-[var(--dash-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 transition-[filter,transform] hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
          >
            {waSaving ? 'A guardar…' : 'Salvar automação'}
          </button>
        </div>
      </section>

      {savingKey ? (
        <p className="mt-6 text-center text-xs text-vyria-navy-muted">
          A guardar…
        </p>
      ) : null}
    </div>
  )
}
