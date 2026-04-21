'use client'

import type { Plan } from '@/lib/plan'
import { planMonthlyPriceLabel, planTier } from '@/lib/plan'
import Link from 'next/link'
import { useMemo } from 'react'

const PLANS: Plan[] = ['START', 'GROWTH', 'PRO', 'MASTER']

const PRICE_LABEL: Record<Plan, string> = {
  START: planMonthlyPriceLabel('START'),
  GROWTH: planMonthlyPriceLabel('GROWTH'),
  PRO: planMonthlyPriceLabel('PRO'),
  MASTER: planMonthlyPriceLabel('MASTER'),
}

const TITLE: Record<Plan, string> = {
  START: 'Start',
  GROWTH: 'Growth',
  PRO: 'Pro',
  MASTER: 'Master',
}

const FEATURE_LINES: Record<Plan, string[]> = {
  START: [
    'Dashboard',
    'Produtos',
    'Financeiro básico',
    'Configurações',
  ],
  GROWTH: [
    'Tudo do Start',
    'Pedidos em tempo real',
    'Promoções e cupons',
    'Relatórios',
    'Aparência personalizada',
    'Importar cardápio por foto (IA)',
    'Chatbot no WhatsApp com envio automático do link do cardápio',
  ],
  PRO: [
    'Tudo do Growth',
    'KDS monitor de cozinha',
    'PDV balcão',
    'Impressão automática',
    'Descrição e imagem de produto com IA',
  ],
  MASTER: [
    'Tudo do Pro',
    'Estoque',
    'Automações avançadas',
    'Recuperação de carrinho IA',
    'Sugestão de preço',
    'Previsão de demanda',
    'Campanhas WhatsApp',
    'App garçom',
  ],
}

export function PlanosPageClient({
  currentPlan,
  whatsappHref,
}: {
  currentPlan: Plan
  whatsappHref: string | null
}) {
  const currentTier = planTier(currentPlan)
  const recommendedPlan = useMemo((): Plan | null => {
    if (currentPlan === 'MASTER') return null
    const idx = PLANS.indexOf(currentPlan)
    return idx >= 0 && idx < PLANS.length - 1 ? PLANS[idx + 1]! : null
  }, [currentPlan])

  return (
    <div className="mx-auto w-full max-w-[1280px] pb-8 xl:max-w-[1400px]">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-vyria-plum">
          Planos Vyria Delivery
        </p>
        <h1 className="mt-2 font-brand text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
          Conheça nossos planos
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-vyria-navy-muted">
          Compare funcionalidades e faça upgrade quando precisar. O plano atual da tua loja está
          indicado abaixo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const tier = planTier(plan)
          const isCurrent = plan === currentPlan
          const isRecommended = recommendedPlan === plan
          const isBelow = tier < currentTier
          return (
            <div
              key={plan}
              className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm shadow-black/[0.04] transition-opacity ${
                isCurrent
                  ? 'border-[var(--dash-primary)] ring-2 ring-[var(--dash-primary)]/20'
                  : 'border-[var(--card-border)]'
              } ${isBelow ? 'opacity-55' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-vyria-navy-muted">
                    {TITLE[plan]}
                  </p>
                  <p className="mt-1 text-lg font-bold text-vyria-navy">{PRICE_LABEL[plan]}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isCurrent ? (
                    <span className="rounded-full bg-[var(--dash-primary)]/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--dash-primary)]">
                      Seu plano atual
                    </span>
                  ) : null}
                  {isRecommended ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 ring-1 ring-amber-200/80">
                      Recomendado
                    </span>
                  ) : null}
                </div>
              </div>
              <ul className="mt-4 flex-1 space-y-2 text-sm leading-snug text-vyria-navy-muted">
                {FEATURE_LINES[plan].map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--dash-primary)]/70" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <div className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-3">
        {whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-vyria-gradient inline-flex w-full items-center justify-center rounded-xl px-6 py-3.5 text-center text-sm font-semibold shadow-md shadow-[var(--dash-primary)]/25 transition-[filter] hover:brightness-105"
          >
            Falar com especialista para upgrade
          </a>
        ) : null}
        <Link
          href="/dashboard"
          className="text-sm font-semibold text-vyria-plum underline-offset-2 hover:underline"
        >
          Voltar ao painel
        </Link>
      </div>
    </div>
  )
}
