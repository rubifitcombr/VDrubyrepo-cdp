'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  DEFAULT_MAX_WEIGHT_KG,
  DEFAULT_MIN_WEIGHT_KG,
} from '@/lib/weighable-product'
import { printWeighableLabel } from '@/lib/scale/weighable-barcode.client'

export type WeighableFormValues = {
  soldByWeight: boolean
  pricePerKg: string
  pluCode: string
  defaultTareKg: string
  minWeightKg: string
  maxWeightKg: string
}

export function defaultWeighableFormValues(): WeighableFormValues {
  return {
    soldByWeight: false,
    pricePerKg: '',
    pluCode: '',
    defaultTareKg: '0',
    minWeightKg: String(DEFAULT_MIN_WEIGHT_KG).replace('.', ','),
    maxWeightKg: String(DEFAULT_MAX_WEIGHT_KG).replace('.', ','),
  }
}

export function weighableFormFromProduct(row: {
  sold_by_weight?: boolean
  price_per_kg?: number | string | null
  price?: number | string | null
  plu_code?: string | null
  default_tare_kg?: number | string | null
  min_weight_kg?: number | string | null
  max_weight_kg?: number | string | null
}): WeighableFormValues {
  const numToInput = (v: unknown, fallback: number) => {
    if (v == null || v === '') return String(fallback).replace('.', ',')
    const n = Number(v)
    return Number.isFinite(n) ? String(n).replace('.', ',') : String(fallback).replace('.', ',')
  }
  const sold = row.sold_by_weight === true
  const perKg = row.price_per_kg ?? row.price
  return {
    soldByWeight: sold,
    pricePerKg:
      sold && perKg != null && perKg !== ''
        ? String(perKg).replace('.', ',')
        : '',
    pluCode: row.plu_code != null ? String(row.plu_code) : '',
    defaultTareKg: numToInput(row.default_tare_kg, 0),
    minWeightKg: numToInput(row.min_weight_kg, DEFAULT_MIN_WEIGHT_KG),
    maxWeightKg: numToInput(row.max_weight_kg, DEFAULT_MAX_WEIGHT_KG),
  }
}

export function weighablePayloadFromForm(
  form: WeighableFormValues
): {
  sold_by_weight: boolean
  price_per_kg?: number | string | null
  plu_code?: string | null
  default_tare_kg?: number | string | null
  min_weight_kg?: number | string | null
  max_weight_kg?: number | string | null
} {
  if (!form.soldByWeight) {
    return { sold_by_weight: false }
  }
  return {
    sold_by_weight: true,
    price_per_kg: form.pricePerKg.replace(',', '.'),
    plu_code: form.pluCode.trim(),
    default_tare_kg: form.defaultTareKg.replace(',', '.'),
    min_weight_kg: form.minWeightKg.replace(',', '.'),
    max_weight_kg: form.maxWeightKg.replace(',', '.'),
  }
}

type Props = {
  scaleIntegrationEnabled: boolean
  values: WeighableFormValues
  onChange: (patch: Partial<WeighableFormValues>) => void
  /** Produto já era pesável antes de eventual downgrade de plano. */
  lockedWeighable?: boolean
  /** ID do produto guardado — necessário para imprimir etiqueta de teste. */
  productId?: string | null
}

export function WeighableProductFields({
  scaleIntegrationEnabled,
  values,
  onChange,
  lockedWeighable = false,
  productId = null,
}: Props) {
  const canEditWeighable = scaleIntegrationEnabled || lockedWeighable
  const [labelBusy, setLabelBusy] = useState(false)
  const [labelMsg, setLabelMsg] = useState<string | null>(null)

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[#f9fafb] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-vyria-navy">Vendido por peso</p>
          <p className="mt-0.5 text-xs text-vyria-navy-muted">
            PDV e garçom — não aparece no cardápio online.
          </p>
        </div>
        {!scaleIntegrationEnabled ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200/80">
            Plano Pro · presencial
          </span>
        ) : null}
      </div>

      {!scaleIntegrationEnabled ? (
        <p className="mt-3 text-xs leading-relaxed text-vyria-navy-muted">
          Integração de balança disponível no{' '}
          <Link
            href="/dashboard/upgrade?feature=scale_integration"
            className="font-semibold text-vyria-plum underline"
          >
            plano Pro
          </Link>{' '}
          em operação presencial ou híbrida.
        </p>
      ) : null}

      <label
        className={`mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium text-vyria-navy ${
          !canEditWeighable ? 'cursor-not-allowed opacity-60' : ''
        }`}
      >
        <input
          type="checkbox"
          checked={values.soldByWeight}
          disabled={!canEditWeighable}
          onChange={(e) => {
            const next = e.target.checked
            onChange({
              soldByWeight: next,
              ...(next
                ? {}
                : {
                    pricePerKg: '',
                    pluCode: '',
                    defaultTareKg: '0',
                    minWeightKg: String(DEFAULT_MIN_WEIGHT_KG).replace('.', ','),
                    maxWeightKg: String(DEFAULT_MAX_WEIGHT_KG).replace('.', ','),
                  }),
            })
          }}
        />
        Produto pesável (preço por kg)
      </label>

      {values.soldByWeight ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-vyria-navy sm:col-span-2">
            Preço por kg (R$) *
            <input
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
              inputMode="decimal"
              placeholder="59,90"
              value={values.pricePerKg}
              disabled={!canEditWeighable}
              onChange={(e) => onChange({ pricePerKg: e.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-vyria-navy">
            Código PLU *
            <input
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm font-mono"
              inputMode="numeric"
              maxLength={5}
              placeholder="Ex.: 78912"
              value={values.pluCode}
              disabled={!canEditWeighable}
              onChange={(e) =>
                onChange({ pluCode: e.target.value.replace(/\D/g, '').slice(0, 5) })
              }
            />
            <span className="mt-1 block text-[11px] text-vyria-navy-muted">
              2–5 dígitos — usado na etiqueta e leitor de código de barras.
            </span>
          </label>
          <label className="block text-sm font-medium text-vyria-navy">
            Tara padrão (kg)
            <input
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
              inputMode="decimal"
              placeholder="0,020"
              value={values.defaultTareKg}
              disabled={!canEditWeighable}
              onChange={(e) => onChange({ defaultTareKg: e.target.value })}
            />
            <span className="mt-1 block text-[11px] text-vyria-navy-muted">
              Peso do prato/embalagem descontado na balança.
            </span>
          </label>
          <label className="block text-sm font-medium text-vyria-navy">
            Peso mínimo (kg)
            <input
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
              inputMode="decimal"
              value={values.minWeightKg}
              disabled={!canEditWeighable}
              onChange={(e) => onChange({ minWeightKg: e.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-vyria-navy">
            Peso máximo (kg)
            <input
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
              inputMode="decimal"
              value={values.maxWeightKg}
              disabled={!canEditWeighable}
              onChange={(e) => onChange({ maxWeightKg: e.target.value })}
            />
          </label>
          {scaleIntegrationEnabled && values.soldByWeight && values.pluCode.trim() ? (
            <div className="sm:col-span-2 rounded-xl border border-dashed border-[var(--card-border)] bg-white px-3 py-3">
              <p className="text-xs font-semibold text-vyria-navy">Etiqueta EAN-13</p>
              <p className="mt-1 text-[11px] leading-relaxed text-vyria-navy-muted">
                Imprime uma etiqueta de exemplo (0,350 kg) na impressora configurada em Impressão.
              </p>
              <button
                type="button"
                disabled={!productId || labelBusy || !canEditWeighable}
                onClick={() => {
                  if (!productId) return
                  setLabelBusy(true)
                  setLabelMsg(null)
                  void printWeighableLabel({ productId, weightKg: 0.35 }).then((res) => {
                    setLabelBusy(false)
                    setLabelMsg(res.ok ? 'Etiqueta enviada à impressora.' : res.message)
                  })
                }}
                className="mt-2 rounded-lg border border-[var(--card-border)] bg-[#fafafa] px-3 py-2 text-xs font-semibold text-vyria-navy hover:bg-white disabled:opacity-50"
              >
                {labelBusy ? 'A imprimir…' : 'Imprimir etiqueta de exemplo'}
              </button>
              {!productId ? (
                <p className="mt-2 text-[11px] text-vyria-navy-muted">
                  Guarda o produto primeiro para imprimir a etiqueta.
                </p>
              ) : null}
              {labelMsg ? (
                <p className="mt-2 text-[11px] text-vyria-navy-muted">{labelMsg}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
