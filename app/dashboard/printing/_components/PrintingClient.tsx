'use client'

import { useCallback, useMemo, useState } from 'react'
import type { StorePrintingKey, StorePrintingState } from '@/lib/store-printing'
import { updateStore } from '@/services/store'
import { IconPrinter } from '@/app/dashboard/_components/NavIcons'

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
      'Imprimir automaticamente quando um pedido for confirmado.',
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

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function ReceiptPreview({
  storeName,
  includeCustomer,
  deliveryCopy,
  deliveryFee,
}: {
  storeName: string
  includeCustomer: boolean
  deliveryCopy: boolean
  deliveryFee: number
}) {
  const header = storeName.trim().toUpperCase() || 'A TUA LOJA'
  const subtotal = 63.8
  const total = subtotal + deliveryFee

  return (
    <div className="mx-auto max-w-[220px] rounded-lg border border-vyria-navy/10 bg-[#ececec] p-4 shadow-inner">
      <div className="bg-white px-3 py-4 font-mono text-[11px] leading-relaxed text-vyria-navy shadow-sm">
        <p className="text-center font-bold tracking-wide">{header}</p>
        <p className="my-2 border-t border-dashed border-vyria-navy/30" />
        <p className="font-semibold">PEDIDO #001</p>
        <p className="mt-2">2x Smash Burger Clássico</p>
        <p>1x Coca Cola 350ml</p>
        <p className="my-2 border-t border-dashed border-vyria-navy/30" />
        <p>Subtotal: {money.format(subtotal)}</p>
        <p>Taxa entrega: {money.format(deliveryFee)}</p>
        <p className="mt-1 font-bold">TOTAL: {money.format(total)}</p>
        {includeCustomer ? (
          <>
            <p className="my-2 border-t border-dashed border-vyria-navy/30" />
            <p>Cliente: João Silva</p>
            <p>Tel: (11) 98765-4321</p>
            <p>Rua das Acácias, 456</p>
            <p>Pagamento: PIX</p>
          </>
        ) : null}
        {deliveryCopy ? (
          <>
            <p className="my-2 border-t border-dashed border-vyria-navy/30" />
            <p className="text-center font-bold uppercase">2ª via — entregador</p>
          </>
        ) : null}
      </div>
    </div>
  )
}

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
  const [error, setError] = useState<string | null>(null)

  const fee = useMemo(
    () => (Number.isFinite(deliveryFee) && deliveryFee >= 0 ? deliveryFee : 5.99),
    [deliveryFee]
  )

  const printPreviewToWindow = useCallback(() => {
    const subtotal = 63.8
    const total = subtotal + fee
    const w = window.open('', 'PRINT', 'width=360,height=640')
    if (!w) {
      alert('Permite pop-ups para testar a impressão.')
      return
    }
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const header = esc(storeName.trim().toUpperCase() || 'A TUA LOJA')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Cupom</title>
<style>
  body{font-family:ui-monospace,monospace;font-size:12px;padding:12px;max-width:220px;margin:0 auto;color:#111}
  h1{font-size:13px;text-align:center;margin:0 0 8px}
  .line{border-top:1px dashed #999;margin:8px 0}
</style></head><body>
<h1>${header}</h1>
<p><strong>PEDIDO #001</strong></p>
<p>2x Smash Burger Clássico<br/>1x Coca Cola 350ml</p>
<div class="line"></div>
<p>Subtotal: ${money.format(subtotal)}</p>
<p>Taxa entrega: ${money.format(fee)}</p>
<p><strong>TOTAL: ${money.format(total)}</strong></p>
${
  values.print_include_customer_details
    ? `<div class="line"></div><p>Cliente: João Silva<br/>Tel: (11) 98765-4321<br/>Rua das Acácias, 456<br/>Pagamento: PIX</p>`
    : ''
}
${
  values.print_delivery_copy
    ? `<div class="line"></div><p style="text-align:center;font-weight:bold">2ª via — entregador</p>`
    : ''
}
<script>window.onload=function(){window.print();}</script>
</body></html>`
    w.document.write(html)
    w.document.close()
  }, [fee, storeName, values.print_delivery_copy, values.print_include_customer_details])

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
        /print_auto|print_include|print_delivery|column/i.test(msg) ||
          upErr.code === 'PGRST204'
          ? 'Executa o script scripts/supabase-store-printing.sql no Supabase.'
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
                disabled={savingKey !== null}
                onToggle={() => toggle(key)}
                label={title}
              />
            </li>
          ))}
        </ul>
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
          <button
            type="button"
            onClick={printPreviewToWindow}
            className="shrink-0 rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-vyria-navy shadow-sm hover:bg-[#f9fafb]"
          >
            Imprimir teste (janela)
          </button>
        </div>
        <div className="mt-6 flex justify-center">
          <ReceiptPreview
            storeName={storeName}
            includeCustomer={values.print_include_customer_details}
            deliveryCopy={values.print_delivery_copy}
            deliveryFee={fee}
          />
        </div>
      </div>

      {savingKey ? (
        <p className="mt-6 text-center text-xs text-vyria-navy-muted">
          A guardar…
        </p>
      ) : null}
    </div>
  )
}
