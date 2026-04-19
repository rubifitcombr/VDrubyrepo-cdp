'use client'

import type { AssinaturaPageModel } from '@/lib/billing'
import type { BillingSubscriptionStatus } from '@/lib/billing'
import {
  planContentBadgeClass,
  planMonthlyPriceLabel,
  planShortLabel,
  plansAbove,
  recommendedUpgradePlan,
  type Plan,
} from '@/lib/plan'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const dateShort = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function statusInvoiceLabel(s: string): string {
  if (s === 'paid') return 'Pago'
  if (s === 'pending') return 'Pendente'
  if (s === 'failed') return 'Falhou'
  return s
}

function statusInvoiceClass(s: string): string {
  if (s === 'paid') return 'bg-emerald-50 text-[var(--dash-success)] ring-1 ring-emerald-200/80'
  if (s === 'pending') return 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/80'
  if (s === 'failed') return 'bg-red-50 text-red-800 ring-1 ring-red-200/80'
  return 'bg-[#f3f4f6] text-[#374151] ring-1 ring-black/5'
}

function subscriptionStatusPresentation(
  s: BillingSubscriptionStatus
): { label: string; className: string } {
  if (s === 'active') {
    return {
      label: 'Ativa',
      className:
        'bg-emerald-50 text-[var(--dash-success)] ring-1 ring-emerald-200/80',
    }
  }
  if (s === 'overdue') {
    return {
      label: 'Inadimplente',
      className: 'bg-amber-50 text-amber-950 ring-1 ring-amber-200/80',
    }
  }
  return {
    label: 'Cancelada',
    className: 'bg-red-50 text-red-800 ring-1 ring-red-200/80',
  }
}

function IconCard({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 8.25h19.5M2.25 9h19.5m-19.5 7.5h19.5M4.5 3.75h15A2.25 2.25 0 0121.75 6v12A2.25 2.25 0 0119.5 20.25h-15a2.25 2.25 0 01-2.25-2.25V6a2.25 2.25 0 012.25-2.25z"
      />
    </svg>
  )
}

function IconPix({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.3 2.3a2.4 2.4 0 012.8 0l7.2 5.2c.7.5 1.1 1.3 1.1 2.2v6.6c0 .9-.4 1.7-1.1 2.2l-7.2 5.2a2.4 2.4 0 01-2.8 0l-7.2-5.2A2.7 2.7 0 013 16.3V9.7c0-.9.4-1.7 1.1-2.2l7.2-5.2zM8.8 9.1v5.8l3.2 2.3 3.2-2.3V9.1l-3.2-2.3-3.2 2.3z" />
    </svg>
  )
}

function UpgradeModal({
  open,
  currentPlan,
  onClose,
  onConfirm,
  confirming,
}: {
  open: boolean
  currentPlan: Plan
  onClose: () => void
  onConfirm: (p: Plan) => void
  confirming: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const options = plansAbove(currentPlan)
  const rec = recommendedUpgradePlan(currentPlan)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-4 sm:pb-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        className="max-h-[min(92dvh,52rem)] w-full max-w-[calc(100vw-0px)] overflow-y-auto rounded-t-2xl border border-[var(--card-border)] border-b-0 bg-white shadow-xl sm:max-h-[min(92vh,52rem)] sm:max-w-xl sm:rounded-xl sm:border-b lg:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3 sm:px-5">
          <h2 id="upgrade-modal-title" className="text-base font-semibold text-[#1a1614]">
            Fazer upgrade
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl leading-none text-[#6b7280] hover:bg-[#f5f5f5] hover:text-[#1a1614]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="space-y-3 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] sm:p-6 sm:pb-6">
          <p className="text-sm text-[#6b7280]">
            Escolhe um plano superior ao atual. O plano da loja será atualizado no sistema após
            confirmares (cobrança é tratada manualmente).
          </p>
          <div className="space-y-3">
            {options.map((p) => {
              const isRec = rec === p
              return (
                <button
                  key={p}
                  type="button"
                  disabled={confirming}
                  onClick={() => onConfirm(p)}
                  className={`flex w-full flex-col rounded-2xl border border-[var(--card-border)] bg-white p-4 text-left shadow-sm transition-[box-shadow,transform] hover:bg-[#fafafa] disabled:opacity-60 ${
                    isRec
                      ? 'ring-2 ring-[var(--dash-primary)] ring-offset-2'
                      : ''
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${planContentBadgeClass(p)}`}
                      >
                        {planShortLabel(p)}
                      </span>
                      {isRec ? (
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--dash-primary)]">
                          Recomendado
                        </span>
                      ) : null}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-[#1a1614]">
                      {planMonthlyPriceLabel(p)}
                    </span>
                  </span>
                  <span className="mt-2 text-xs text-[#6b7280]">
                    Confirma para aplicar o novo plano na loja.
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export function AssinaturaClient({ model }: { model: AssinaturaPageModel }) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const upgradeOptions = plansAbove(model.plan)
  const subUi = subscriptionStatusPresentation(model.subscriptionStatus)

  async function confirmUpgrade(target: Plan) {
    setConfirming(true)
    try {
      const res = await dashboardFetch('/api/billing/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPlan: target }),
      })
      if (res.status === 403) return
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        window.alert(data.error || 'Não foi possível atualizar o plano.')
        return
      }
      setModalOpen(false)
      router.refresh()
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl lg:max-w-4xl">
      <nav className="text-xs text-[#6b7280]">
        <Link href="/dashboard" className="hover:text-[#1a1614]">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-[#1a1614]">Assinatura</span>
      </nav>

      <header className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#1a1614] md:text-3xl">
          Assinatura
        </h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Plano, pagamento e faturas da tua conta Vyria.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-4">
        <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Plano atual
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${planContentBadgeClass(model.plan)}`}
            >
              {model.planBadgeLabel}
            </span>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${subUi.className}`}
            >
              {subUi.label}
            </span>
          </div>
          <p className="mt-4 text-lg font-semibold tabular-nums text-[#1a1614]">
            {model.priceLabel}
          </p>
          <div className="mt-4 grid gap-1 text-sm">
            <span className="text-[#6b7280]">Próxima cobrança</span>
            <span className="font-medium text-[#1a1614]">{model.nextChargeDateLabel}</span>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Forma de pagamento
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {model.paymentMethod?.type === 'pix' ? (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f9fafb] text-teal-600 ring-1 ring-[var(--card-border)]">
                  <IconPix className="h-7 w-7" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#1a1614]">PIX</p>
                  <p className="text-xs text-[#6b7280]">Cobrança via PIX</p>
                </div>
              </>
            ) : model.paymentMethod?.type === 'card' ? (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f9fafb] text-[#374151] ring-1 ring-[var(--card-border)]">
                  <IconCard className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#1a1614]">
                    {model.paymentMethod.brand} · •••• {model.paymentMethod.last4}
                  </p>
                  <p className="text-xs text-[#6b7280]">Cartão de crédito</p>
                </div>
              </>
            ) : (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f9fafb] text-[#9ca3af] ring-1 ring-[var(--card-border)]">
                  <IconCard className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#1a1614]">
                    Nenhum método cadastrado
                  </p>
                  <p className="text-xs text-[#6b7280]">
                    Os dados podem ser preenchidos manualmente na base de dados ou pelo suporte.
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="mt-5">
            {model.paymentChangeUrl ? (
              <a
                href={model.paymentChangeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] shadow-sm transition-colors hover:bg-[#f9fafb]"
              >
                Trocar forma de pagamento
              </a>
            ) : (
              <button
                type="button"
                disabled
                title="Define billing_payment_update_url na loja ou contacta o suporte."
                className="inline-flex cursor-not-allowed rounded-xl border border-[var(--card-border)] bg-[#f9fafb] px-4 py-2.5 text-sm font-semibold text-[#9ca3af]"
              >
                Trocar forma de pagamento
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
          <h2 className="text-base font-bold text-[#1a1614]">Histórico de faturas</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--card-border)]">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-[var(--card-border)] bg-[#f9fafb] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {model.invoices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-[#6b7280]">
                      Sem faturas registadas.
                    </td>
                  </tr>
                ) : (
                  model.invoices.map((inv, i) => (
                    <tr key={`${inv.date}-${i}`}>
                      <td className="px-4 py-3 text-[#1a1614]">
                        {dateShort.format(new Date(inv.date.includes('T') ? inv.date : `${inv.date}T12:00:00`))}
                      </td>
                      <td className="px-4 py-3 text-[#374151]">{inv.description}</td>
                      <td className="px-4 py-3 tabular-nums font-medium text-[#1a1614]">
                        {money.format(inv.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInvoiceClass(inv.status)}`}
                        >
                          {statusInvoiceLabel(inv.status)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {upgradeOptions.length > 0 ? (
          <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
            <h2 className="text-base font-bold text-[#1a1614]">Ações</h2>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-xl bg-[var(--dash-primary)] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
              >
                Fazer upgrade
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <UpgradeModal
        open={modalOpen}
        currentPlan={model.plan}
        onClose={() => !confirming && setModalOpen(false)}
        onConfirm={(p) => void confirmUpgrade(p)}
        confirming={confirming}
      />
    </div>
  )
}
