'use client'

import { planPreviewLinesForMerchant } from '@/lib/merchant-plan-feature-lines'
import {
  operationModeLabel,
  type MerchantOperationMode,
} from '@/lib/merchant-operation-mode'
import type { Plan } from '@/lib/plan'
import {
  COMMERCIAL_PLANS,
  planMonthlyPriceLabel,
  planMonthlyPricesCatalogLinePt,
  planTier,
  recommendedUpgradePlan,
} from '@/lib/plan'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'

const PLANS = COMMERCIAL_PLANS

const TITLE: Record<(typeof COMMERCIAL_PLANS)[number], string> = {
  GROWTH: 'Growth',
  PRO: 'Pro',
}

export type PlanosPreviewTab = MerchantOperationMode

function catalogForTab(tab: PlanosPreviewTab): string {
  return planMonthlyPricesCatalogLinePt(tab)
}

function defaultPreviewTab(storeMode: MerchantOperationMode | null): PlanosPreviewTab {
  return storeMode ?? 'delivery'
}

const MODE_INTRO: Record<
  MerchantOperationMode,
  { indicadoPara: string; resumo: string }
> = {
  delivery: {
    indicadoPara:
      'Negócios em que o foco é vender pelo canal online: cardápio público (link ou QR), pedidos para entrega ou retirada, gestão de entregadores e automações de pedidos — sem operação de salão com PDV ou garçom no painel.',
    resumo:
      'O plano Growth inclui pedidos do site, promoções, aparência e automações; o Pro acrescenta caixa, cozinha (KDS) e impressão ligados a esse fluxo.',
  },
  presencial: {
    indicadoPara:
      'Estabelecimentos que atendem só no espaço físico: balcão (PDV), mesas e consumo no local, com pedidos registados no salão — sem link público de delivery nem gestão de corridas de entrega.',
    resumo:
      'O plano Growth inclui PDV, QR de mesa e pedidos em loja; no Pro entram gestão de garçons (PIN/cadastro), caixa, mapa de mesas, impressão e KDS.',
  },
  hibrido: {
    indicadoPara:
      'Quem precisa dos dois mundos no mesmo contrato: atendimento no balcão e no salão (PDV, garçom, mesas) e, em paralelo, vendas pelo link/QR com entregas, taxas e zona de entrega.',
    resumo:
      'O plano Growth reúne delivery e presencial no mesmo contrato; o Pro acrescenta gestão de garçons, caixa, KDS, impressão e PIX no checkout, com tabela de preços própria.',
  },
}

function ModeloOperacaoIntro({ mode }: { mode: MerchantOperationMode }) {
  const intro = MODE_INTRO[mode]
  const headingId = `${mode}-o-que-e`

  return (
    <section
      className="mb-6 rounded-2xl border border-vyria-plum/25 bg-gradient-to-br from-[var(--dash-primary)]/[0.06] to-white p-5 shadow-sm md:p-6"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-base font-bold text-vyria-navy">
        O que é o modelo {operationModeLabel(mode)}?
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-vyria-navy-muted">
        <strong className="text-vyria-navy">Indicado para:</strong> {intro.indicadoPara}
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-vyria-navy-muted">
        {intro.resumo}
      </p>
      <p className="mt-3 text-xs font-semibold text-vyria-navy">
        Tabela {operationModeLabel(mode)}: {catalogForTab(mode)}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-vyria-navy-muted">
        <strong className="text-vyria-navy">PIX no checkout:</strong> geração de QR Code e
        pagamento directo na conta do lojista — exclusivo do plano Pro (todos os modelos de
        operação).
      </p>

      {mode === 'hibrido' ? (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--card-border)] bg-white">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-[var(--card-border)] bg-[#f9fafb] text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
                <tr>
                  <th className="px-4 py-3">Plano</th>
                  <th className="px-4 py-3">Delivery (online)</th>
                  <th className="px-4 py-3">Presencial (salão)</th>
                  <th className="px-4 py-3">Híbrido (união)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)] text-vyria-navy-muted">
                <tr>
                  <td className="px-4 py-3 font-semibold text-vyria-navy">Growth</td>
                  <td className="px-4 py-3">
                    Cardápio, link/QR, pedidos, promoções, aparência, automações e entregadores
                  </td>
                  <td className="px-4 py-3">
                    PDV, garçom/QR mesa, pedidos, promoções e aparência
                  </td>
                  <td className="px-4 py-3 text-vyria-navy">
                    União dos dois · {planMonthlyPriceLabel('GROWTH', 'hibrido')}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold text-vyria-navy">Pro</td>
                  <td className="px-4 py-3">
                    Caixa, impressão, KDS, PIX no checkout
                  </td>
                  <td className="px-4 py-3">
                    Garçom (mapa), PDV, caixa, impressão, KDS, PIX
                  </td>
                  <td className="px-4 py-3 text-vyria-navy">
                    Operação mista completa + PIX ·{' '}
                    {planMonthlyPriceLabel('PRO', 'hibrido')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-vyria-navy-muted">
            Nos modelos só Delivery ou só Presencial, a tabela mensal é{' '}
            {catalogForTab('delivery')}.
          </p>
        </>
      ) : null}
    </section>
  )
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

  const previewMode = previewTab

  const previewTabs = useMemo(
    () =>
      (['delivery', 'presencial', 'hibrido'] as const).map((id) => ({
        id,
        label: operationModeLabel(id),
      })),
    []
  )

  const priceLabelByPlan = useMemo(
    () =>
      Object.fromEntries(
        PLANS.map((p) => [p, planMonthlyPriceLabel(p, previewMode)])
      ) as Record<(typeof COMMERCIAL_PLANS)[number], string>,
    [previewMode]
  )

  const currentTier = planTier(currentPlan)
  const recommendedPlan = useMemo(() => recommendedUpgradePlan(currentPlan), [currentPlan])

  const previewModeForLines = previewTab

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

      {currentPlan === 'START' ? (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
          <p className="font-semibold">Plano Start (legado)</p>
          <p className="mt-1 text-slate-700">
            O plano de entrada comercial passou a ser o Growth. Fala connosco para actualizar a
            tua assinatura e alinhar o painel às funcionalidades abaixo.
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
          Escolhe um modelo para ver exactamente o que aparece no painel em cada plano — o menu
          lateral segue o modelo de operação da tua loja.
        </p>
        {storeOperationMode != null ? (
          <p className="mt-2 max-w-2xl text-sm font-medium text-vyria-navy">
            A tua loja está com o modelo{' '}
            <span className="text-vyria-plum">{operationModeLabel(storeOperationMode)}</span>.
          </p>
        ) : (
          <p className="mt-2 max-w-2xl text-sm text-vyria-navy-muted">
            Compara abaixo os três modelos; fala connosco para definir o da tua loja.
          </p>
        )}
      </div>

      <div className="mb-6 flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
          Ver funcionalidades como
        </p>
        <div className="flex flex-wrap gap-2">
          {previewTabs.map((t) => (
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
      </div>

      <ModeloOperacaoIntro mode={previewTab} />

      <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
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
                  <p className="mt-1 text-lg font-bold text-vyria-navy">{priceLabelByPlan[plan]}</p>
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
