'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { GuidedPromoWizard } from '@/app/dashboard/promotions/_components/GuidedPromoWizard'
import type { MenuProductRow } from '@/lib/menu-product'
import {
  formatSchedulePreview,
  PROMO_KIND_LABEL,
  splitPromoDescription,
} from '@/lib/promo-guided'
import type { PromotionSuggestionDTO } from '@/lib/promo-suggestions'
import type { StorePromotionRow } from '@/lib/store-promotion'
import {
  getStorePromotionsClient,
  updateStorePromotion,
} from '@/services/promotions'

const moneyPt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatValidUntilLabel(isoDate: string | null): string {
  if (!isoDate?.trim()) return 'Sem data de término'
  const raw = isoDate.trim().slice(0, 10)
  const [y, m, d] = raw.split('-').map(Number)
  if (!y || !m || !d) return 'Sem data de término'
  const dt = new Date(Date.UTC(y, m - 1, d))
  return `Até ${new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt)}`
}

function scheduleLineForCard(p: StorePromotionRow): string {
  const { meta } = splitPromoDescription(p.description)
  if (meta) return formatSchedulePreview(meta)
  return formatValidUntilLabel(p.valid_until)
}

function BoldInline({ text }: { text: string }) {
  const parts = text.split(/\*\*/)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-[#1a1614]">
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}

function PromoActiveSwitch({
  active,
  disabled,
  onToggle,
}: {
  active: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={active ? 'Promoção ativa' : 'Promoção inativa'}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-primary)]/35 disabled:opacity-50 ${
        active ? 'bg-[var(--dash-primary)]' : 'bg-[#d1d5db]'
      }`}
    >
      <span
        className={`pointer-events-none absolute top-0.5 left-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          active ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export function PromotionsManagerClient({
  storeId,
  initialPromotions,
  initialMissingTable = false,
  initialProducts,
  initialSuggestion,
}: {
  storeId: string
  initialPromotions: StorePromotionRow[]
  initialMissingTable?: boolean
  initialProducts: MenuProductRow[]
  initialSuggestion: PromotionSuggestionDTO | null
}) {
  const [rows, setRows] = useState<StorePromotionRow[]>(initialPromotions)
  const [missingTable, setMissingTable] = useState(initialMissingTable)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardEditing, setWizardEditing] = useState<StorePromotionRow | null>(
    null
  )
  const [launch, setLaunch] = useState<{
    key: number
    suggestion: PromotionSuggestionDTO
  } | null>(null)

  useEffect(() => {
    setRows(initialPromotions)
    setMissingTable(initialMissingTable)
  }, [initialPromotions, initialMissingTable])

  const refresh = useCallback(async () => {
    const data = await getStorePromotionsClient(storeId)
    setRows(data)
    if (data.length > 0) setMissingTable(false)
  }, [storeId])

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      const ad = a.valid_until?.slice(0, 10) ?? ''
      const bd = b.valid_until?.slice(0, 10) ?? ''
      if (ad && bd) return ad.localeCompare(bd)
      if (ad) return -1
      if (bd) return 1
      return b.created_at.localeCompare(a.created_at)
    })
  }, [rows])

  function openCreate() {
    setLaunch(null)
    setWizardEditing(null)
    setWizardOpen(true)
  }

  function openEdit(p: StorePromotionRow) {
    setLaunch(null)
    setWizardEditing(p)
    setWizardOpen(true)
  }

  function openWithSuggestion(s: PromotionSuggestionDTO) {
    setWizardEditing(null)
    setLaunch({ key: Date.now(), suggestion: s })
    setWizardOpen(true)
  }

  function closeWizard() {
    setWizardOpen(false)
    setWizardEditing(null)
    setLaunch(null)
  }

  async function toggleActive(p: StorePromotionRow) {
    const next = !p.active
    setBusyIds((prev) => new Set(prev).add(p.id))
    const { error } = await updateStorePromotion(p.id, { active: next })
    setBusyIds((prev) => {
      const n = new Set(prev)
      n.delete(p.id)
      return n
    })
    if (error) {
      if (/relation|does not exist|schema cache|42P01|column.*name|column.*active/i.test(error.message)) {
        setMissingTable(true)
      }
      alert(error.message)
      return
    }
    setRows((prev) =>
      prev.map((r) => (r.id === p.id ? { ...r, active: next } : r))
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <nav className="text-xs text-[#6b7280]">
        <Link href="/dashboard" className="hover:text-[#1a1614]">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-[#1a1614]">Promoções</span>
      </nav>

      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1a1614] md:text-3xl">
            Promoções
          </h1>
          <p className="mt-1 text-sm text-[#6b7280]">
            Promoção guiada: tipo → produtos → desconto → período → pré-visualização.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 rounded-xl bg-[var(--dash-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
        >
          + Nova promoção
        </button>
      </header>

      {missingTable ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          A tabela de promoções está desatualizada no banco. Aplica a migração{' '}
          <code className="rounded bg-amber-100 px-1">
            supabase/migrations/20260725190008_promocoes_schema.sql
          </code>{' '}
          no Supabase.
        </div>
      ) : null}

      {initialSuggestion ? (
        <div className="mt-8 rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50/95 via-white to-amber-50/40 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-violet-800">
                Sugestão automática
              </p>
              <h2 className="mt-2 text-lg font-bold text-[#1a1614] sm:text-xl">
                {initialSuggestion.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#374151]">
                <BoldInline text={initialSuggestion.body} />
              </p>
              <p className="mt-3 text-xs font-medium text-[#6b7280]">
                {initialSuggestion.metricsSummary}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openWithSuggestion(initialSuggestion)}
              className="shrink-0 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 sm:self-center"
            >
              Usar no assistente
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--card-border)] bg-[#fafafa] px-5 py-4 text-sm text-[#6b7280]">
          <span className="font-semibold text-[#374151]">Sugestões inteligentes: </span>
          com pelo menos <strong>5 pedidos</strong> nos últimos{' '}
          <strong>45 dias</strong>, aparece aqui uma ideia de combo com base nos
          produtos mais vendidos, no teu <strong>ticket médio</strong> e no{' '}
          <strong>horário mais calmo</strong> (10h–22h, Brasília).
        </div>
      )}

      {sortedRows.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-[var(--card-border)] bg-white px-6 py-16 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dash-primary)]/12 text-2xl font-bold text-[var(--dash-primary)]">
            %
          </div>
          <p className="mt-4 text-sm font-medium text-[#1a1614]">
            Nenhuma promoção criada
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#6b7280]">
            Usa o assistente para montar combos com imagens, calcular descontos e
            ver o que o cliente vai ver antes de guardar.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-6 text-sm font-semibold text-[var(--dash-primary)] hover:underline"
          >
            Criar primeira promoção
          </button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sortedRows.map((p) => {
            const busy = busyIds.has(p.id)
            const active = p.active !== false
            const { human, meta } = splitPromoDescription(p.description)
            const descShow = human || p.description?.trim() || 'Sem descrição.'
            return (
              <li
                key={p.id}
                className="flex flex-col rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04] transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--dash-primary)]/12 text-lg font-bold text-[var(--dash-primary)]">
                    %
                  </span>
                  <div className="flex flex-col items-end gap-2">
                    {meta ? (
                      <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#374151]">
                        {PROMO_KIND_LABEL[meta.kind]}
                      </span>
                    ) : null}
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          active
                            ? 'bg-[var(--dash-primary)] text-white'
                            : 'bg-[#f3f4f6] text-[#374151]'
                        }`}
                      >
                        {active ? 'Ativa' : 'Inativa'}
                      </span>
                      <PromoActiveSwitch
                        active={active}
                        disabled={busy}
                        onToggle={() => void toggleActive(p)}
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="mt-4 text-left"
                >
                  <h2 className="text-lg font-bold text-[#1a1614]">{p.name}</h2>
                  {p.promotional_price != null &&
                  !Number.isNaN(Number(p.promotional_price)) &&
                  Number(p.promotional_price) > 0 ? (
                    <p className="mt-2 text-sm font-semibold text-[var(--dash-primary)]">
                      Preço promocional:{' '}
                      {moneyPt.format(Number(p.promotional_price))}
                    </p>
                  ) : null}
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#6b7280]">
                    {descShow}
                  </p>
                </button>
                <p className="mt-auto flex items-start gap-2 pt-4 text-xs leading-snug text-[#6b7280]">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5"
                    />
                  </svg>
                  <span>{scheduleLineForCard(p)}</span>
                </p>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="mt-3 text-xs font-semibold text-[var(--dash-primary)] hover:underline"
                >
                  Editar com assistente
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <GuidedPromoWizard
        open={wizardOpen}
        onClose={closeWizard}
        storeId={storeId}
        products={initialProducts}
        editing={wizardEditing}
        onSaved={() => void refresh()}
        launchKey={launch?.key ?? 0}
        launchSuggestion={launch?.suggestion ?? null}
      />
    </div>
  )
}
