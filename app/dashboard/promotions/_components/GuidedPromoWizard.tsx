'use client'

import { MenuImage } from '@/app/_components/MenuImage'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MenuProductRow } from '@/lib/menu-product'
import {
  buildDescriptionWithMeta,
  computePromoPrice,
  formatSchedulePreview,
  needsDiscountStep,
  needsProductPicker,
  presetHappyHourSp,
  presetTodaySp,
  presetWeekendSp,
  PROMO_KIND_LABEL,
  type DiscountMode,
  type GuidedPromoMetaV2,
  type PromoKind,
  type SchedulePreset,
  splitPromoDescription,
  sumReferenceFromCatalog,
} from '@/lib/promo-guided'
import type { PromotionSuggestionDTO } from '@/lib/promo-suggestions'
import type { StorePromotionRow } from '@/lib/store-promotion'
import {
  createStorePromotion,
  deleteStorePromotion,
  updateStorePromotion,
} from '@/services/promotions'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function parsePromotionalPrice(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const normalized = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : t.replace(/\s/g, '')
  const n = Number(normalized)
  if (Number.isNaN(n) || n <= 0) return null
  return n
}

function parsePercentInput(raw: string): number | null {
  const t = raw.trim().replace('%', '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (Number.isNaN(n) || n < 0 || n > 100) return null
  return n
}

function formatPriceInputFromDb(
  value: number | string | null | undefined
): string {
  if (value == null || value === '') return ''
  const n = Number(value)
  if (Number.isNaN(n)) return ''
  return String(n).replace('.', ',')
}

function WizardModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-4 sm:pb-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[min(94dvh,48rem)] w-full max-w-[calc(100vw-0px)] overflow-y-auto rounded-t-2xl border border-[var(--card-border)] border-b-0 bg-white shadow-xl sm:max-h-[min(92vh,48rem)] sm:max-w-2xl sm:rounded-2xl sm:border-b"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--card-border)] bg-white px-4 py-3 sm:px-6">
          <h2 className="text-base font-bold text-[#1a1614]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl leading-none text-[#6b7280] hover:bg-[#f5f5f5]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="p-4 pb-8 sm:p-6">{children}</div>
      </div>
    </div>
  )
}

const KINDS: PromoKind[] = [
  'combo',
  'product_discount',
  'bundle_more',
  'free_shipping',
  'coupon',
]

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-6 flex justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full transition-colors ${
            i + 1 <= step ? 'bg-[var(--dash-primary)]' : 'bg-[#e5e7eb]'
          }`}
        />
      ))}
    </div>
  )
}

type StepId = 'type' | 'products' | 'discount' | 'schedule' | 'preview'

export function GuidedPromoWizard({
  open,
  onClose,
  storeId,
  products,
  editing,
  onSaved,
  launchKey = 0,
  launchSuggestion = null,
}: {
  open: boolean
  onClose: () => void
  storeId: string
  products: MenuProductRow[]
  editing: StorePromotionRow | null
  onSaved: () => void
  launchKey?: number
  launchSuggestion?: PromotionSuggestionDTO | null
}) {
  const catalog = useMemo(
    () => products.filter((p) => p.active !== false),
    [products]
  )

  const [stepIndex, setStepIndex] = useState(0)
  const [kind, setKind] = useState<PromoKind>('combo')
  const [productIds, setProductIds] = useState<string[]>([])
  const [discountMode, setDiscountMode] = useState<DiscountMode>('final')
  const [finalStr, setFinalStr] = useState('')
  const [percentStr, setPercentStr] = useState('')
  const [fixedStr, setFixedStr] = useState('')
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>('custom')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [timeStart, setTimeStart] = useState('')
  const [timeEnd, setTimeEnd] = useState('')
  const [bundleRule, setBundleRule] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [promoName, setPromoName] = useState('')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const prevOpenRef = useRef(false)
  const launchAppliedRef = useRef(0)

  const applyFromSuggestion = useCallback((s: PromotionSuggestionDTO) => {
    setKind(s.kind)
    setProductIds([...s.productIds])
    setDiscountMode('final')
    setFinalStr('')
    setPercentStr('')
    setFixedStr('')
    setSchedulePreset(s.schedulePreset)
    setValidFrom(s.validFrom ?? '')
    setValidUntil(s.validUntil ?? '')
    setTimeStart(s.timeStart ?? '')
    setTimeEnd(s.timeEnd ?? '')
    setBundleRule('')
    setCouponCode('')
    setPromoName(s.suggestedPromoName)
    setActive(true)
    const chain: StepId[] = ['type']
    if (needsProductPicker(s.kind)) chain.push('products')
    if (needsDiscountStep(s.kind)) chain.push('discount')
    chain.push('schedule', 'preview')
    const dIdx = chain.indexOf('discount')
    setStepIndex(dIdx >= 0 ? dIdx : Math.min(1, chain.length - 1))
  }, [])

  const resetForCreate = useCallback(() => {
    setStepIndex(0)
    setKind('combo')
    setProductIds([])
    setDiscountMode('final')
    setFinalStr('')
    setPercentStr('')
    setFixedStr('')
    setSchedulePreset('custom')
    setValidFrom('')
    setValidUntil('')
    setTimeStart('')
    setTimeEnd('')
    setBundleRule('')
    setCouponCode('')
    setPromoName('')
    setActive(true)
  }, [])

  const hydrateFromRow = useCallback(
    (p: StorePromotionRow) => {
      const { human, meta } = splitPromoDescription(p.description)
      setPromoName(p.name)
      setActive(p.active !== false)
      setValidUntil(p.valid_until?.slice(0, 10) ?? '')
      if (meta) {
        setKind(meta.kind)
        setProductIds([...meta.productIds])
        setDiscountMode(meta.discountMode)
        setSchedulePreset(meta.schedulePreset)
        setValidFrom(meta.validFrom ?? '')
        setValidUntil(meta.validUntil ?? p.valid_until?.slice(0, 10) ?? '')
        setTimeStart(meta.timeStart ?? '')
        setTimeEnd(meta.timeEnd ?? '')
        setBundleRule(meta.bundleRule ?? '')
        setCouponCode(meta.couponCode ?? '')
        if (meta.discountMode === 'final' && p.promotional_price != null) {
          setFinalStr(formatPriceInputFromDb(p.promotional_price))
        }
        if (meta.discountPercent != null) {
          setPercentStr(
            String(meta.discountPercent).replace('.', ',').replace(/\.0+$/, '')
          )
        }
        if (meta.discountFixed != null) {
          setFixedStr(formatPriceInputFromDb(meta.discountFixed))
        }
        setStepIndex(0)
        return
      }
      setKind('combo')
      setProductIds([])
      setBundleRule(human || '')
      setFinalStr(formatPriceInputFromDb(p.promotional_price))
      setSchedulePreset('custom')
      setValidFrom('')
      setStepIndex(0)
    },
    []
  )

  useEffect(() => {
    if (!open) {
      prevOpenRef.current = false
      launchAppliedRef.current = 0
      return
    }

    const justOpened = !prevOpenRef.current
    prevOpenRef.current = true

    if (editing) {
      if (justOpened) {
        const t = window.setTimeout(() => hydrateFromRow(editing), 0)
        return () => window.clearTimeout(t)
      }
      return
    }

    if (launchKey > 0 && launchSuggestion) {
      if (launchAppliedRef.current !== launchKey) {
        launchAppliedRef.current = launchKey
        const t = window.setTimeout(() => applyFromSuggestion(launchSuggestion), 0)
        return () => window.clearTimeout(t)
      }
      return
    }

    if (justOpened) {
      const t = window.setTimeout(() => resetForCreate(), 0)
      return () => window.clearTimeout(t)
    }
  }, [
    open,
    editing,
    launchKey,
    launchSuggestion,
    hydrateFromRow,
    resetForCreate,
    applyFromSuggestion,
  ])

  const reference = useMemo(
    () => sumReferenceFromCatalog(productIds, catalog),
    [productIds, catalog]
  )

  const { promo: computedPromo, pct: computedPct } = useMemo(
    () =>
      computePromoPrice(
        reference,
        discountMode,
        finalStr,
        percentStr,
        fixedStr
      ),
    [reference, discountMode, finalStr, percentStr, fixedStr]
  )

  const stepIds = useMemo((): StepId[] => {
    const s: StepId[] = ['type']
    if (needsProductPicker(kind)) s.push('products')
    if (needsDiscountStep(kind)) s.push('discount')
    s.push('schedule', 'preview')
    return s
  }, [kind])

  useEffect(() => {
    const t = window.setTimeout(() => {
      setStepIndex((i) => Math.min(i, Math.max(0, stepIds.length - 1)))
    }, 0)
    return () => window.clearTimeout(t)
  }, [stepIds.length])

  const currentStep: StepId =
    stepIds[Math.min(stepIndex, Math.max(0, stepIds.length - 1))] ?? 'type'

  function goNext() {
    if (currentStep === 'type') {
      if (needsProductPicker(kind)) {
        if (kind === 'product_discount' && productIds.length !== 1) {
          alert('Escolhe um produto para aplicar o desconto.')
          return
        }
        if (
          (kind === 'combo' || kind === 'bundle_more') &&
          productIds.length < 1
        ) {
          alert('Adiciona pelo menos um produto.')
          return
        }
      }
    }
    if (currentStep === 'discount') {
      if (kind === 'coupon') {
        if (!couponCode.trim()) {
          alert('Indica o código do cupom.')
          return
        }
      } else if (kind === 'bundle_more') {
        if (!bundleRule.trim()) {
          alert('Descreve a regra (ex.: Leve 3, pague 2).')
          return
        }
      } else if (
        (kind === 'combo' || kind === 'product_discount') &&
        reference > 0
      ) {
        if (computedPromo == null) {
          alert('Define o desconto (preço final, % ou valor a menos).')
          return
        }
      }
    }
    setStepIndex((i) => Math.min(i + 1, stepIds.length - 1))
  }

  function goBack() {
    setStepIndex((i) => Math.max(0, i - 1))
  }

  function applyPreset(preset: SchedulePreset) {
    setSchedulePreset(preset)
    if (preset === 'today') {
      const { validFrom: f, validUntil: u } = presetTodaySp()
      setValidFrom(f)
      setValidUntil(u)
      setTimeStart('')
      setTimeEnd('')
    } else if (preset === 'weekend') {
      const { validFrom: f, validUntil: u } = presetWeekendSp()
      setValidFrom(f)
      setValidUntil(u)
      setTimeStart('')
      setTimeEnd('')
    } else if (preset === 'happy_hour') {
      const h = presetHappyHourSp()
      setValidFrom(h.validFrom)
      setValidUntil(h.validUntil)
      setTimeStart(h.timeStart)
      setTimeEnd(h.timeEnd)
    }
  }

  const humanSummary = useMemo(() => {
    const names = productIds
      .map((id) => catalog.find((p) => p.id === id)?.name)
      .filter(Boolean) as string[]
    if (kind === 'free_shipping') return 'Frete grátis em entregas.'
    if (kind === 'coupon')
      return couponCode.trim()
        ? `Cupom ${couponCode.trim()}`
        : 'Cupom de desconto'
    if (kind === 'bundle_more' && bundleRule.trim()) return bundleRule.trim()
    if (names.length) return names.join(' + ')
    return promoName.trim() || 'Promoção'
  }, [kind, productIds, catalog, bundleRule, couponCode, promoName])

  const metaForSave = useCallback((): GuidedPromoMetaV2 => {
    const ref =
      kind === 'free_shipping' || kind === 'coupon'
        ? 0
        : sumReferenceFromCatalog(productIds, catalog)
    const { promo, pct } = computePromoPrice(
      ref,
      discountMode,
      finalStr,
      percentStr,
      fixedStr
    )
    let discountPercentMeta: number | null = null
    if (kind === 'coupon') {
      discountPercentMeta = parsePercentInput(percentStr)
    } else if (discountMode === 'percent' && pct != null) {
      discountPercentMeta = pct
    } else if (promo != null && ref > 0) {
      discountPercentMeta = Math.round(((ref - promo) / ref) * 1000) / 10
    }
    return {
      v: 2,
      kind,
      productIds: [...productIds],
      referenceTotal: ref,
      discountMode,
      discountPercent: discountPercentMeta,
      discountFixed:
        discountMode === 'fixed' ? parsePromotionalPrice(fixedStr) : null,
      schedulePreset,
      validFrom: validFrom.trim() || null,
      validUntil: validUntil.trim() || null,
      timeStart: timeStart.trim() || null,
      timeEnd: timeEnd.trim() || null,
      bundleRule: bundleRule.trim() || null,
      couponCode: couponCode.trim() || null,
    }
  }, [
    kind,
    productIds,
    catalog,
    discountMode,
    finalStr,
    percentStr,
    fixedStr,
    schedulePreset,
    validFrom,
    validUntil,
    timeStart,
    timeEnd,
    bundleRule,
    couponCode,
  ])

  async function save() {
    const name = promoName.trim() || humanSummary
    if (!name) {
      alert('Indica um nome para a promoção.')
      return
    }
    const meta = metaForSave()
    const desc = buildDescriptionWithMeta(humanSummary, meta)

    let promoPrice: number | null = null
    if (kind === 'combo' || kind === 'product_discount') {
      const { promo } = computePromoPrice(
        reference,
        discountMode,
        finalStr,
        percentStr,
        fixedStr
      )
      promoPrice = promo
    } else if (kind === 'bundle_more' && finalStr.trim()) {
      promoPrice = parsePromotionalPrice(finalStr)
    }

    setSaving(true)
    try {
      if (editing) {
        const { error } = await updateStorePromotion(editing.id, {
          name,
          description: desc,
          valid_until: validUntil.trim() || null,
          promotional_price: promoPrice,
          active,
        })
        setSaving(false)
        if (error) {
          alert(error.message)
          return
        }
      } else {
        const { error } = await createStorePromotion({
          store_id: storeId,
          name,
          description: desc,
          valid_until: validUntil.trim() || null,
          promotional_price: promoPrice,
          active,
        })
        setSaving(false)
        if (error) {
          alert(error.message)
          return
        }
      }
      onSaved()
      onClose()
    } catch (e) {
      setSaving(false)
      alert(e instanceof Error ? e.message : 'Erro ao guardar.')
    }
  }

  async function handleDelete() {
    if (!editing) return
    if (!confirm('Remover esta promoção?')) return
    setSaving(true)
    const { error } = await deleteStorePromotion(editing.id)
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    onSaved()
    onClose()
  }

  const previewMeta = metaForSave()
  const scheduleLine = formatSchedulePreview(previewMeta)

  const renderStepContent = () => {
    if (currentStep === 'type') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-[#6b7280]">
            Escolhe o tipo — organiza a oferta e nós ajudamos com preços e
            texto.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold transition ${
                  kind === k
                    ? 'border-[var(--dash-primary)] bg-[var(--dash-primary)]/8 text-[#1a1614]'
                    : 'border-[var(--card-border)] bg-white text-[#374151] hover:border-zinc-300'
                }`}
              >
                {PROMO_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (currentStep === 'products') {
      return (
        <ProductPickerStep
          kind={kind}
          catalog={catalog}
          productIds={productIds}
          setProductIds={setProductIds}
          storeId={storeId}
        />
      )
    }

    if (currentStep === 'discount') {
      if (kind === 'coupon') {
        return (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-[#1a1614]">
              Código do cupom
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 font-mono text-sm uppercase"
                placeholder="EX.: VERAO10"
              />
            </label>
            <label className="block text-sm font-medium text-[#1a1614]">
              Desconto (%)
              <input
                inputMode="decimal"
                value={percentStr}
                onChange={(e) => setPercentStr(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                placeholder="Ex.: 10"
              />
            </label>
          </div>
        )
      }
      if (kind === 'bundle_more') {
        return (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-[#1a1614]">
              Regra da promoção
              <textarea
                value={bundleRule}
                onChange={(e) => setBundleRule(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                placeholder="Ex.: Leve 3 açaís médios, pague 2"
              />
            </label>
            <p className="text-xs text-[#6b7280]">
              Opcional: preço final do conjunto (se aplicável)
            </p>
            <input
              inputMode="decimal"
              value={finalStr}
              onChange={(e) => setFinalStr(e.target.value)}
              className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              placeholder="Preço final (opcional)"
            />
          </div>
        )
      }
      return (
        <DiscountStep
          reference={reference}
          discountMode={discountMode}
          setDiscountMode={setDiscountMode}
          finalStr={finalStr}
          setFinalStr={setFinalStr}
          percentStr={percentStr}
          setPercentStr={setPercentStr}
          fixedStr={fixedStr}
          setFixedStr={setFixedStr}
          computedPromo={computedPromo}
          computedPct={computedPct}
        />
      )
    }

    if (currentStep === 'schedule') {
      return (
        <ScheduleStep
          schedulePreset={schedulePreset}
          applyPreset={applyPreset}
          setSchedulePreset={setSchedulePreset}
          validFrom={validFrom}
          setValidFrom={setValidFrom}
          validUntil={validUntil}
          setValidUntil={setValidUntil}
          timeStart={timeStart}
          setTimeStart={setTimeStart}
          timeEnd={timeEnd}
          setTimeEnd={setTimeEnd}
        />
      )
    }

    const couponPct = parsePercentInput(percentStr)

    return (
      <PreviewStep
        promoName={promoName}
        setPromoName={setPromoName}
        active={active}
        setActive={setActive}
        humanSummary={humanSummary}
        kind={kind}
        reference={reference}
        computedPromo={computedPromo}
        computedPct={kind === 'coupon' ? couponPct : computedPct}
        scheduleLine={scheduleLine}
        couponCode={couponCode}
        bundleRule={bundleRule}
      />
    )
  }

  const atFirst = stepIndex === 0
  const atLast = stepIndex >= stepIds.length - 1

  return (
    <WizardModal
      open={open}
      title={editing ? 'Editar promoção guiada' : 'Nova promoção guiada'}
      onClose={() => !saving && onClose()}
    >
      <StepDots step={stepIndex + 1} total={stepIds.length} />
      {renderStepContent()}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] pt-4">
        {editing ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleDelete()}
            className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Eliminar
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {!atFirst ? (
            <button
              type="button"
              disabled={saving}
              onClick={goBack}
              className="rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50"
            >
              Voltar
            </button>
          ) : null}
          {!atLast ? (
            <button
              type="button"
              disabled={saving}
              onClick={goNext}
              className="rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Seguinte
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'A guardar…' : 'Guardar promoção'}
            </button>
          )}
        </div>
      </div>
    </WizardModal>
  )
}

function ProductPickerStep({
  kind,
  catalog,
  productIds,
  setProductIds,
  storeId,
}: {
  kind: PromoKind
  catalog: MenuProductRow[]
  productIds: string[]
  setProductIds: (ids: string[]) => void
  storeId: string
}) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return catalog
    return catalog.filter((p) => p.name.toLowerCase().includes(t))
  }, [catalog, q])

  function toggle(id: string) {
    if (kind === 'product_discount') {
      setProductIds(productIds.includes(id) ? [] : [id])
      return
    }
    if (productIds.includes(id)) {
      setProductIds(productIds.filter((x) => x !== id))
    } else {
      setProductIds([...productIds, id])
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#6b7280]">
        {kind === 'product_discount'
          ? 'Toca num produto para selecionar.'
          : 'Adiciona produtos ao combo — como um carrinho.'}
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Procurar por nome…"
        className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
      />
      <ul className="max-h-[min(50vh,22rem)] space-y-2 overflow-y-auto pr-1">
        {filtered.map((p) => {
          const selected = productIds.includes(p.id)
          const price = Number(p.price) || 0
          return (
            <li
              key={p.id}
              className={`flex gap-3 rounded-xl border p-3 ${
                selected
                  ? 'border-[var(--dash-primary)] bg-[var(--dash-primary)]/5'
                  : 'border-[var(--card-border)] bg-white'
              }`}
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#f3f4f6]">
                {p.image_url ? (
                  <MenuImage
                    src={p.image_url}
                    storeId={storeId}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="56px"
                    fallback={
                      <div className="flex h-full items-center justify-center text-xs text-[#9ca3af]">
                        —
                      </div>
                    }
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-[#9ca3af]">
                    —
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[#1a1614]">{p.name}</p>
                <p className="text-sm text-[var(--dash-primary)]">
                  {money.format(price)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className="shrink-0 self-center rounded-lg bg-[var(--dash-primary)] px-3 py-1.5 text-xs font-semibold text-white"
              >
                {selected
                  ? 'Remover'
                  : kind === 'product_discount'
                    ? 'Selecionar'
                    : 'Adicionar'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function DiscountStep({
  reference,
  discountMode,
  setDiscountMode,
  finalStr,
  setFinalStr,
  percentStr,
  setPercentStr,
  fixedStr,
  setFixedStr,
  computedPromo,
  computedPct,
}: {
  reference: number
  discountMode: DiscountMode
  setDiscountMode: (m: DiscountMode) => void
  finalStr: string
  setFinalStr: (s: string) => void
  percentStr: string
  setPercentStr: (s: string) => void
  fixedStr: string
  setFixedStr: (s: string) => void
  computedPromo: number | null
  computedPct: number | null
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['final', 'Preço final'],
            ['percent', '% desconto'],
            ['fixed', 'Valor a menos'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setDiscountMode(m)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              discountMode === m
                ? 'bg-[var(--dash-primary)] text-white'
                : 'border border-[var(--card-border)] bg-white text-[#374151]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {discountMode === 'final' ? (
        <label className="block text-sm font-medium">
          Preço promocional final
          <input
            inputMode="decimal"
            value={finalStr}
            onChange={(e) => setFinalStr(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            placeholder="Ex.: 39,90"
          />
        </label>
      ) : null}
      {discountMode === 'percent' ? (
        <label className="block text-sm font-medium">
          Percentagem de desconto
          <input
            inputMode="decimal"
            value={percentStr}
            onChange={(e) => setPercentStr(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            placeholder="Ex.: 25"
          />
        </label>
      ) : null}
      {discountMode === 'fixed' ? (
        <label className="block text-sm font-medium">
          Quanto menos em relação ao preço normal
          <input
            inputMode="decimal"
            value={fixedStr}
            onChange={(e) => setFixedStr(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            placeholder="Ex.: 13,00"
          />
        </label>
      ) : null}
      {reference > 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950">
          <p className="font-semibold">Resumo</p>
          <p className="mt-1">
            Preço normal: <strong>{money.format(reference)}</strong>
          </p>
          {computedPromo != null ? (
            <>
              <p className="mt-1">
                Promoção: <strong>{money.format(computedPromo)}</strong>
              </p>
              {computedPct != null && computedPct > 0 ? (
                <p className="mt-1">
                  Estás a oferecer cerca de{' '}
                  <strong>{computedPct}%</strong> de desconto.
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-emerald-800/90">Preenche o desconto acima.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-amber-800">
          Sem produtos selecionados — volta ao passo anterior ou escolhe tipo
          com produtos.
        </p>
      )}
    </div>
  )
}

function ScheduleStep({
  schedulePreset,
  applyPreset,
  setSchedulePreset,
  validFrom,
  setValidFrom,
  validUntil,
  setValidUntil,
  timeStart,
  setTimeStart,
  timeEnd,
  setTimeEnd,
}: {
  schedulePreset: SchedulePreset
  applyPreset: (p: SchedulePreset) => void
  setSchedulePreset: (p: SchedulePreset) => void
  validFrom: string
  setValidFrom: (s: string) => void
  validUntil: string
  setValidUntil: (s: string) => void
  timeStart: string
  setTimeStart: (s: string) => void
  timeEnd: string
  setTimeEnd: (s: string) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6b7280]">Período e horários (Brasília)</p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['today', 'Só hoje'],
            ['weekend', 'Fim de semana'],
            ['happy_hour', 'Happy hour'],
            ['custom', 'Datas livres'],
          ] as const
        ).map(([p, label]) => (
          <button
            key={p}
            type="button"
            onClick={() =>
              p === 'custom' ? setSchedulePreset('custom') : applyPreset(p)
            }
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              schedulePreset === p
                ? 'bg-[var(--dash-primary)] text-white'
                : 'border border-[var(--card-border)] bg-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Início
          <input
            type="date"
            value={validFrom}
            onChange={(e) => {
              setValidFrom(e.target.value)
              setSchedulePreset('custom')
            }}
            className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Fim
          <input
            type="date"
            value={validUntil}
            onChange={(e) => {
              setValidUntil(e.target.value)
              setSchedulePreset('custom')
            }}
            className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          Hora início
          <input
            type="time"
            value={timeStart}
            onChange={(e) => setTimeStart(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Hora fim
          <input
            type="time"
            value={timeEnd}
            onChange={(e) => setTimeEnd(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm"
          />
        </label>
      </div>
      <p className="text-xs text-[#6b7280]">
        Happy hour: preenche automaticamente 18h–23h e 14 dias; podes ajustar.
      </p>
    </div>
  )
}

function PreviewStep({
  promoName,
  setPromoName,
  active,
  setActive,
  humanSummary,
  kind,
  reference,
  computedPromo,
  computedPct,
  scheduleLine,
  couponCode,
  bundleRule,
}: {
  promoName: string
  setPromoName: (s: string) => void
  active: boolean
  setActive: (b: boolean) => void
  humanSummary: string
  kind: PromoKind
  reference: number
  computedPromo: number | null
  computedPct: number | null
  scheduleLine: string
  couponCode: string
  bundleRule: string
}) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-[#1a1614]">
        Nome da campanha
        <input
          value={promoName}
          onChange={(e) => setPromoName(e.target.value)}
          placeholder={humanSummary}
          className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
        />
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-[#374151]">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 rounded border-[var(--card-border)] text-[var(--dash-primary)]"
        />
        Promoção ativa
      </label>
      <div className="rounded-2xl border-2 border-dashed border-[var(--dash-primary)]/40 bg-gradient-to-b from-[var(--dash-primary)]/6 to-white p-5 shadow-inner">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--dash-primary)]">
          Pré-visualização (cliente)
        </p>
        <p className="mt-3 text-xl font-bold text-[#1a1614]">
          {promoName.trim() || humanSummary}
        </p>
        {kind === 'coupon' ? (
          <p className="mt-2 text-sm text-[#374151]">
            Código: <strong className="font-mono">{couponCode || '—'}</strong>
            {computedPct != null && computedPct > 0 ? (
              <> · {computedPct}% off</>
            ) : null}
          </p>
        ) : kind === 'free_shipping' ? (
          <p className="mt-2 text-lg font-semibold text-emerald-700">
            Frete grátis
          </p>
        ) : kind === 'bundle_more' ? (
          <p className="mt-2 text-sm leading-relaxed text-[#374151]">
            {bundleRule || humanSummary}
          </p>
        ) : reference > 0 && computedPromo != null ? (
          <p className="mt-2 text-base text-[#374151]">
            De <span className="line-through">{money.format(reference)}</span>{' '}
            por{' '}
            <span className="font-bold text-[var(--dash-primary)]">
              {money.format(computedPromo)}
            </span>
            {computedPct != null && computedPct > 0 ? (
              <span className="ml-2 text-sm font-semibold text-emerald-700">
                (−{computedPct}%)
              </span>
            ) : null}
          </p>
        ) : (
          <p className="mt-2 text-sm text-[#374151]">{humanSummary}</p>
        )}
        <p className="mt-3 text-sm font-medium text-[#6b7280]">{scheduleLine}</p>
      </div>
    </div>
  )
}
