'use client'

import type { AssinaturaPageModel } from '@/lib/billing'
import type { BillingSubscriptionStatus } from '@/lib/billing'
import {
  beneficiosAdicionaisProximoPlano,
  beneficiosDoPlano,
  proximoPlano,
} from '@/lib/assinatura-beneficios'
import {
  planContentBadgeClass,
  planMonthlyPriceLabel,
  planShortLabel,
} from '@/lib/plan'
import Link from 'next/link'
import { useState } from 'react'

const dateShort = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const MAX_BENEFICIOS = 5

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

/** Dias até a data YYYY-MM-DD (negativo = vencido). */
function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y!, m! - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function IconAlert({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  )
}

export function AssinaturaClient({ model }: { model: AssinaturaPageModel }) {
  const [showAllBenefits, setShowAllBenefits] = useState(false)

  const subUi = subscriptionStatusPresentation(model.subscriptionStatus)
  const lista = beneficiosDoPlano(model.plan)
  const visiveis = showAllBenefits ? lista : lista.slice(0, MAX_BENEFICIOS)
  const temMais = lista.length > MAX_BENEFICIOS

  const nextP = proximoPlano(model.plan)
  const extras =
    nextP ? beneficiosAdicionaisProximoPlano(model.plan, nextP) : []

  let bannerVencimento: 'none' | 'warning' | 'expired' = 'none'
  let diasLabel = ''
  if (model.planoVenceEm && /^\d{4}-\d{2}-\d{2}$/.test(model.planoVenceEm)) {
    const d = daysUntil(model.planoVenceEm)
    if (d < 0) {
      bannerVencimento = 'expired'
    } else if (d <= 7) {
      bannerVencimento = 'warning'
      diasLabel = d === 0 ? 'hoje' : `${d} ${d === 1 ? 'dia' : 'dias'}`
    }
  }

  const wa = model.whatsappHref
  const showAcoesUpgrade = model.plan !== 'MASTER' && !!wa

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
          Plano, benefícios e faturas da tua conta Vyria.
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

          <div className="mt-6 border-t border-[var(--card-border)] pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Incluído no teu plano
            </p>
            <ul className="mt-3 space-y-2">
              {visiveis.map((line) => (
                <li key={line} className="flex gap-2 text-sm text-[#374151]">
                  <IconCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {temMais ? (
              <button
                type="button"
                onClick={() => setShowAllBenefits(!showAllBenefits)}
                className="mt-3 text-sm font-semibold text-[var(--dash-primary)] hover:underline"
              >
                {showAllBenefits ? 'Mostrar menos' : 'Ver todos os benefícios'}
              </button>
            ) : null}
          </div>
        </section>

        {bannerVencimento === 'warning' ? (
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm md:p-5">
            <IconAlert className="h-6 w-6 shrink-0 text-amber-700" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-950">
                Seu plano vence em {diasLabel}. Renove agora para não perder o acesso.
              </p>
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
                >
                  Renovar agora
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {bannerVencimento === 'expired' ? (
          <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm md:p-5">
            <IconAlert className="h-6 w-6 shrink-0 text-red-700" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-950">
                Seu plano está vencido. Entre em contato para reativar.
              </p>
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
                >
                  Falar com suporte
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {nextP ? (
          <section className="rounded-2xl border border-[var(--card-border)] bg-[#fafafa] p-6 shadow-sm md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                  Próximo plano
                </p>
                <p className="mt-1 text-lg font-bold text-[#1a1614]">
                  {planShortLabel(nextP)} — {planMonthlyPriceLabel(nextP)}
                </p>
              </div>
              <span className="inline-flex rounded-full bg-[var(--dash-primary)]/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--dash-primary)]">
                Recomendado para você
              </span>
            </div>
            {extras.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {extras.map((line) => (
                  <li key={line} className="flex gap-2 text-sm text-[#374151]">
                    <IconCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[#6b7280]">
                Mais recursos e limites superiores ao teu plano atual.
              </p>
            )}
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex rounded-xl bg-[var(--dash-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 hover:brightness-105"
              >
                Falar com especialista
              </a>
            ) : null}
          </section>
        ) : null}

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
                      Nenhuma fatura registrada ainda.
                    </td>
                  </tr>
                ) : (
                  model.invoices.map((inv, i) => (
                    <tr key={`${inv.date}-${inv.description}-${i}`}>
                      <td className="px-4 py-3 text-[#1a1614]">
                        {dateShort.format(
                          new Date(inv.date.includes('T') ? inv.date : `${inv.date}T12:00:00`)
                        )}
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

        {showAcoesUpgrade ? (
          <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
            <h2 className="text-base font-bold text-[#1a1614]">Ações</h2>
            <div className="mt-4">
              <a
                href={wa!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex justify-center rounded-xl bg-[var(--dash-primary)] px-6 py-3 text-center text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 transition-[filter] hover:brightness-105"
              >
                Falar com especialista para upgrade
              </a>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
