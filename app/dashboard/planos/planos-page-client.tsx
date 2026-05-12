'use client'

import { planPreviewLinesForMerchant } from '@/lib/merchant-plan-feature-lines'
import {
  operationModeLabel,
  type MerchantOperationMode,
} from '@/lib/merchant-operation-mode'
import type { Plan } from '@/lib/plan'
import { planMonthlyPriceLabel, planTier, recommendedUpgradePlan } from '@/lib/plan'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'

const PLANS: Plan[] = ['START', 'GROWTH', 'PRO']

export type PlanosPreviewTab = 'legacy' | MerchantOperationMode

const PREVIEW_TABS: { id: PlanosPreviewTab; label: string; hint: string }[] = [
  {
    id: 'legacy',
    label: 'Sem modelo definido',
    hint: 'Menu do painel só por plano (comportamento anterior).',
  },
  {
    id: 'delivery',
    label: operationModeLabel('delivery'),
    hint: 'Foco em pedidos online, entregas e WhatsApp.',
  },
  {
    id: 'presencial',
    label: operationModeLabel('presencial'),
    hint: 'Balcão, PDV e operação no espaço físico.',
  },
  {
    id: 'hibrido',
    label: operationModeLabel('hibrido'),
    hint: 'Combina canal online com atendimento presencial.',
  },
]

function defaultPreviewTab(storeMode: MerchantOperationMode | null): PlanosPreviewTab {
  if (storeMode == null) return 'legacy'
  return storeMode
}

const PRICE_LABEL: Record<Plan, string> = {
  START: planMonthlyPriceLabel('START'),
  GROWTH: planMonthlyPriceLabel('GROWTH'),
  PRO: planMonthlyPriceLabel('PRO'),
}

const TITLE: Record<Plan, string> = {
  START: 'Start',
  GROWTH: 'Growth',
  PRO: 'Pro',
}

export function PlanosPageClient({
  currentPlan,
  storeOperationMode,
  whatsappHref,
}: {
  currentPlan: Plan
  storeOperationMode: MerchantOperationMode | null
  whatsappHref: string | null
}) {
  const searchParams = useSearchParams()
  const planRestricted = searchParams.get('planRestricted') === '1'

  const [previewTab, setPreviewTab] = useState<PlanosPreviewTab>(() =>
    defaultPreviewTab(storeOperationMode)
  )

  const currentTier = planTier(currentPlan)
  const recommendedPlan = useMemo(() => recommendedUpgradePlan(currentPlan), [currentPlan])

  const tabMeta = PREVIEW_TABS.find((t) => t.id === previewTab)
  const previewModeForLines: MerchantOperationMode | null =
    previewTab === 'legacy' ? null : previewTab

  return (
    <div className="mx-auto w-full max-w-[1280px] pb-8 xl:max-w-[1400px]">
      {planRestricted ? (
        <div
          className="mb-6 rounded-2xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm shadow-amber-900/5"
          role="status"
        >
          <p className="font-semibold">Destino não disponível no teu painel</p>
          <p className="mt-1 text-amber-950/90">
            O endereço que tentaste abrir não faz parte do teu plano e modelo de operação actuais.
            Compara abaixo o que cada plano inclui em cada modelo, ou fala connosco para ajustar o
            plano ou o modelo da tua loja.
          </p>
        </div>
      ) : null}

      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-vyria-plum">
          Planos Vyria Delivery
        </p>
        <h1 className="mt-2 font-brand text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
          Planos em cada modelo de operação
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-vyria-navy-muted">
          Escolhe um modelo para ver exactamente o que aparece no painel em cada plano. Isto
          corresponde ao menu lateral quando o modelo da loja está definido; em «Sem modelo
          definido» o painel continua só por plano (legado).
        </p>
        {storeOperationMode != null ? (
          <p className="mt-2 max-w-2xl text-sm font-medium text-vyria-navy">
            A tua loja está com o modelo{' '}
            <span className="text-vyria-plum">{operationModeLabel(storeOperationMode)}</span>.
          </p>
        ) : (
          <p className="mt-2 max-w-2xl text-sm text-vyria-navy-muted">
            A tua loja ainda não tem modelo comercial definido no sistema — o painel usa só o
            plano (legado).
          </p>
        )}
      </div>

      <div className="mb-6 flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
          Ver funcionalidades como
        </p>
        <div className="flex flex-wrap gap-2">
          {PREVIEW_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPreviewTab(t.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                previewTab === t.id
                  ? 'border-[var(--dash-primary)] bg-[var(--dash-primary)]/12 text-vyria-navy ring-1 ring-[var(--dash-primary)]/25'
                  : 'border-[var(--card-border)] bg-white text-vyria-navy-muted hover:border-vyria-plum/35 hover:text-vyria-navy'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tabMeta ? (
          <p className="text-xs leading-snug text-vyria-navy-muted">{tabMeta.hint}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PLANS.map((plan) => {
          const tier = planTier(plan)
          const isCurrent = plan === currentPlan
          const isRecommended = recommendedPlan === plan
          const isBelow = tier < currentTier
          const lines = planPreviewLinesForMerchant(plan, previewModeForLines)
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
                      Teu plano actual
                    </span>
                  ) : null}
                  {isRecommended ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 ring-1 ring-amber-200/80">
                      Upgrade natural
                    </span>
                  ) : null}
                </div>
              </div>
              <ul className="mt-4 flex-1 space-y-2 text-sm leading-snug text-vyria-navy-muted">
                {lines.map((line) => (
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
            Falar com especialista (plano ou modelo de operação)
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
