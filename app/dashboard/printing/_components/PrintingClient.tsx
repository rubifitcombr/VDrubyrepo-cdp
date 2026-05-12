'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import type { StorePrintingKey, StorePrintingState } from '@/lib/store-printing'
import {
  getPrintSerialBaud,
  PRINT_SERIAL_BAUD_OPTIONS,
  setPrintSerialBaud,
} from '@/lib/print/device-prefs'
import type { PaperMm } from '@/lib/print/layout'
import { openPrintingPreviewPopup } from '@/lib/printing-preview-window'
import { updateStore } from '@/services/store'
import { IconPrinter } from '@/app/dashboard/_components/NavIcons'
import { ReceiptPreview } from './ReceiptPreview'

function PrintSwitch({
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
  key: StorePrintingKey
  title: string
  description: string
}> = [
  {
    key: 'print_auto_on_confirm',
    title: 'Impressão automática',
    description:
      'Ao entrar em «Preparando», imprimir o cupom (PDV, garçom/QR, pedido pelo link do cardápio, etc.) com o painel em qualquer página, quando a automação ou esta opção estiver ativa.',
  },
  {
    key: 'print_include_customer_details',
    title: 'Imprimir detalhes do cliente',
    description:
      'Incluir nome, telefone e endereço na impressão.',
  },
  {
    key: 'print_delivery_copy',
    title: 'Cópia para entregador',
    description: 'Imprimir segunda via para o entregador.',
  },
]

export function PrintingClient({
  storeId,
  storeName,
  deliveryFee,
  initial,
}: {
  storeId: string
  storeName: string
  deliveryFee: number
  initial: StorePrintingState
}) {
  const [values, setValues] = useState<StorePrintingState>(initial)
  const [savingKey, setSavingKey] = useState<StorePrintingKey | null>(null)
  const [savingPaper, setSavingPaper] = useState(false)
  const [serialBaud, setSerialBaud] = useState(() => getPrintSerialBaud())
  const [error, setError] = useState<string | null>(null)

  const fee = useMemo(
    () => (Number.isFinite(deliveryFee) && deliveryFee >= 0 ? deliveryFee : 5.99),
    [deliveryFee]
  )

  const printPreviewToWindow = useCallback(() => {
    const ok = openPrintingPreviewPopup({
      storeName,
      fee,
      values: {
        print_include_customer_details: values.print_include_customer_details,
        print_delivery_copy: values.print_delivery_copy,
        print_paper_mm: values.print_paper_mm,
      },
      returnPath: '/dashboard/printing',
    })
    if (!ok) {
      alert('Permite pop-ups para testar a impressão.')
    }
  }, [fee, storeName, values.print_delivery_copy, values.print_include_customer_details, values.print_paper_mm])

  async function toggle(key: StorePrintingKey) {
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
        /print_auto|print_include|print_delivery|print_paper|column/i.test(msg) ||
          upErr.code === 'PGRST204'
          ? 'Executa o script scripts/supabase-store-printing.sql no Supabase.'
          : msg || 'Não foi possível guardar.'
      )
    }
  }

  async function savePaperMm(mm: PaperMm) {
    if (mm === values.print_paper_mm) return
    const prev = values.print_paper_mm
    setValues((v) => ({ ...v, print_paper_mm: mm }))
    setError(null)
    setSavingPaper(true)
    const { error: upErr } = await updateStore(storeId, { print_paper_mm: mm })
    setSavingPaper(false)
    if (upErr) {
      setValues((v) => ({ ...v, print_paper_mm: prev }))
      const msg = upErr.message || ''
      setError(
        /print_paper|column/i.test(msg) || upErr.code === 'PGRST204'
          ? 'Executa o script scripts/supabase-store-print-paper.sql no Supabase.'
          : msg || 'Não foi possível guardar.'
      )
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div>
        <h1 className="font-brand text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
          Impressão
        </h1>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Configure a impressão térmica para cozinha.
        </p>
      </div>

      {error ? (
        <p
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-8 rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-vyria-navy-deep/[0.04] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--dash-primary)]/12 text-[var(--dash-primary)]"
              aria-hidden
            >
              <IconPrinter className="h-6 w-6" />
            </div>
            <h2 className="font-brand text-lg font-bold text-vyria-navy">
              Impressora térmica
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
              aria-hidden
            />
            Conectada
          </span>
        </div>

        <ul className="mt-6 divide-y divide-vyria-navy/10">
          {ROWS.map(({ key, title, description }) => (
            <li
              key={key}
              className="flex items-center gap-4 py-4 first:pt-0 last:pb-0 sm:gap-5"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-vyria-navy">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-vyria-navy-muted">
                  {description}
                </p>
              </div>
              <PrintSwitch
                on={values[key]}
                disabled={savingKey !== null || savingPaper}
                onToggle={() => toggle(key)}
                label={title}
              />
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-vyria-navy/10 pt-6">
          <h3 className="font-semibold text-vyria-navy">Largura do papel e porta série</h3>
          <p className="mt-1 text-sm text-vyria-navy-muted">
            A largura sincroniza com a loja (cupons pedido e caixa). A velocidade em baud fica só neste
            browser, para «Enviar porta série» no pop-up de impressão ESC/POS.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-vyria-navy-muted">
              Largura do rolo
              <select
                className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm font-medium text-vyria-navy"
                value={values.print_paper_mm}
                disabled={savingKey !== null || savingPaper}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  void savePaperMm(v === 58 ? 58 : 80)
                }}
              >
                <option value={80}>80 mm (48 colunas)</option>
                <option value={58}>58 mm (32 colunas)</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-vyria-navy-muted">
              Velocidade série (Web Serial)
              <select
                className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm font-medium text-vyria-navy"
                value={serialBaud}
                disabled={savingKey !== null}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setSerialBaud(n)
                  setPrintSerialBaud(n)
                }}
              >
                {PRINT_SERIAL_BAUD_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b} baud
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-brand text-lg font-bold text-vyria-navy">
              Pré-visualização do cupom
            </h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              Simulação de cupom térmico com base nas opções ativas.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <Link
              href="/dashboard/printing/preview"
              className="inline-flex items-center justify-center rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-105"
            >
              Abrir pré-visualização (voltar ao painel)
            </Link>
            <button
              type="button"
              onClick={printPreviewToWindow}
              className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-vyria-navy shadow-sm hover:bg-[#f9fafb]"
            >
              Imprimir teste (janela)
            </button>
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <ReceiptPreview
            storeName={storeName}
            includeCustomer={values.print_include_customer_details}
            deliveryCopy={values.print_delivery_copy}
            deliveryFee={fee}
            paperMm={values.print_paper_mm}
          />
        </div>
      </div>

      {savingKey || savingPaper ? (
        <p className="mt-6 text-center text-xs text-vyria-navy-muted">
          A guardar…
        </p>
      ) : null}
    </div>
  )
}
