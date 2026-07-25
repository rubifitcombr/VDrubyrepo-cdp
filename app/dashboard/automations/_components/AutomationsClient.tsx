'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { Plan } from '@/lib/plan'
import { hasOrderPipelineAutomations } from '@/lib/plan'
import type {
  StoreAutomationKey,
  StoreAutomationsState,
} from '@/lib/store-automations'
import { updateStore } from '@/services/store'
import { IconBolt, IconBell } from '@/app/dashboard/_components/NavIcons'

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
    key: 'auto_accept_orders',
    title: 'Aceitar pedidos automaticamente',
    description:
      'Colocar novos pedidos em «Preparando» automaticamente (cardápio/slug, QR e autoatendimento, garçom e PDV «Enviar para o Caixa»), com o painel aberto.',
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
]

export function AutomationsClient({
  storeId,
  storePlan,
  initial,
}: {
  storeId: string
  storePlan: Plan
  initial: StoreAutomationsState
}) {
  const [values, setValues] = useState<StoreAutomationsState>(initial)
  const [savingKey, setSavingKey] = useState<StoreAutomationKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canUseOrderAutomations = hasOrderPipelineAutomations(storePlan)

  const orderAutomationRows = useMemo(() => ROWS, [])

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
        /auto_accept|auto_notify|auto_close|column/i.test(msg) ||
          upErr.code === 'PGRST204'
          ? 'Colunas de automações em falta na base de dados. Aplica a migração supabase/migrations/20260725140000_stores_automations_columns.sql no SQL Editor do Supabase.'
          : msg || 'Não foi possível guardar.'
      )
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div>
        <h1 className="font-brand text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
          Automações
        </h1>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Aceite automático de pedidos, notificações e fecho fora de horário. A
          ligação WhatsApp por API oficial da Meta será adicionada em breve.
        </p>
      </div>

      {!canUseOrderAutomations ? (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <span className="font-semibold">Queres mais automações?</span>{' '}
          Faz upgrade para Growth ou Pro para ativar aceite automático,
          notificações e fecho fora de horário.{' '}
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
          {orderAutomationRows.map(({ key, title, description, Icon }) => (
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

      {savingKey ? (
        <p className="mt-6 text-center text-xs text-vyria-navy-muted">
          A guardar…
        </p>
      ) : null}
    </div>
  )
}
