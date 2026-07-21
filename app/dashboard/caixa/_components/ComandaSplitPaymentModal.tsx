'use client'

import { useMemo, useState } from 'react'
import {
  orderPaymentMethodLabel,
  type OrderPaymentLine,
  type OrderPaymentMethod,
} from '@/lib/order-payments'
import { MONEY_TOLERANCE_BRL, roundMoneyBrl } from '@/lib/money-tolerance'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const METHODS: OrderPaymentMethod[] = [
  'cash',
  'pix',
  'card_credit',
  'card_debit',
  'card',
]

function parseAmount(raw: string): number {
  const n = Number(raw.replace(',', '.').trim())
  if (Number.isNaN(n) || n < 0) return 0
  return roundMoneyBrl(n)
}

function formatAmountInput(n: number): string {
  if (n <= 0) return ''
  return n.toFixed(2).replace('.', ',')
}

export function ComandaSplitPaymentModal({
  open,
  comandaLabel,
  orderTotal,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  comandaLabel: string
  orderTotal: number
  busy?: boolean
  onClose: () => void
  onConfirm: (lines: OrderPaymentLine[]) => void
}) {
  if (!open) return null

  return (
    <ComandaSplitPaymentModalBody
      key={`${comandaLabel}-${orderTotal}`}
      comandaLabel={comandaLabel}
      orderTotal={orderTotal}
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  )
}

function ComandaSplitPaymentModalBody({
  comandaLabel,
  orderTotal,
  busy,
  onClose,
  onConfirm,
}: {
  comandaLabel: string
  orderTotal: number
  busy?: boolean
  onClose: () => void
  onConfirm: (lines: OrderPaymentLine[]) => void
}) {
  const total = roundMoneyBrl(orderTotal)
  const [launched, setLaunched] = useState<OrderPaymentLine[]>([])
  const [draftMethod, setDraftMethod] = useState<OrderPaymentMethod>('cash')
  const [draftAmount, setDraftAmount] = useState(() => formatAmountInput(total))

  const paid = useMemo(
    () => roundMoneyBrl(launched.reduce((s, l) => s + l.amount, 0)),
    [launched]
  )
  const remaining = roundMoneyBrl(total - paid)

  function launchPayment() {
    const amount = parseAmount(draftAmount)
    if (amount <= 0) return
    if (amount > remaining + MONEY_TOLERANCE_BRL) return
    setLaunched((prev) => [...prev, { method: draftMethod, amount }])
    const nextRemaining = roundMoneyBrl(remaining - amount)
    setDraftAmount(formatAmountInput(Math.max(0, nextRemaining)))
  }

  function removeLaunched(index: number) {
    setLaunched((prev) => prev.filter((_, i) => i !== index))
  }

  function handleConfirm() {
    if (launched.length === 0) return
    onConfirm(launched)
  }

  const canLaunch =
    parseAmount(draftAmount) > 0 &&
    parseAmount(draftAmount) <= remaining + MONEY_TOLERANCE_BRL
  const canConfirm =
    launched.length > 0 && Math.abs(remaining) <= MONEY_TOLERANCE_BRL

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Fechar"
        onClick={() => !busy && onClose()}
      />
      <div className="relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#1a1614]">Receber comanda</h3>
            <p className="mt-0.5 text-sm text-[#6b7280]">{comandaLabel}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl leading-none text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">Total</p>
            <p className="text-lg font-bold text-[#1a1614]">{money.format(total)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">Lançado</p>
            <p className="text-lg font-bold text-emerald-700">{money.format(paid)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">Falta</p>
            <p
              className={`text-lg font-bold ${
                Math.abs(remaining) <= MONEY_TOLERANCE_BRL
                  ? 'text-emerald-700'
                  : remaining > 0
                    ? 'text-amber-700'
                    : 'text-red-700'
              }`}
            >
              {money.format(Math.max(0, remaining))}
            </p>
          </div>
        </div>

        {launched.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {launched.map((line, idx) => (
              <li
                key={`${idx}-${line.method}-${line.amount}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--card-border)] bg-white px-3 py-2"
              >
                <div>
                  <p className="text-xs font-semibold text-[#1a1614]">
                    {orderPaymentMethodLabel(line.method)}
                  </p>
                  <p className="text-sm font-bold text-emerald-700">{money.format(line.amount)}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeLaunched(idx)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-center text-xs text-[#6b7280]">
            Lance cada pagamento abaixo. O sistema abate do total automaticamente.
          </p>
        )}

        {remaining > MONEY_TOLERANCE_BRL ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--card-border)] bg-[#fafafa] p-3">
            <p className="text-xs font-semibold text-[#374151]">Novo lançamento</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="min-w-[7rem] flex-1 text-[11px] font-medium text-[#6b7280]">
                Forma
                <select
                  value={draftMethod}
                  disabled={busy}
                  onChange={(e) => setDraftMethod(e.target.value as OrderPaymentMethod)}
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] bg-white px-2 py-2 text-xs font-semibold"
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {orderPaymentMethodLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-28 text-[11px] font-medium text-[#6b7280]">
                Valor
                <input
                  type="text"
                  inputMode="decimal"
                  disabled={busy}
                  value={draftAmount}
                  onChange={(e) => setDraftAmount(e.target.value)}
                  placeholder="0,00"
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] bg-white px-2 py-2 text-right text-sm font-semibold tabular-nums"
                />
              </label>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDraftAmount(formatAmountInput(remaining))}
                className="flex-1 rounded-lg border border-[var(--card-border)] bg-white py-2 text-xs font-semibold text-[#374151]"
              >
                Usar valor restante
              </button>
              <button
                type="button"
                disabled={busy || !canLaunch}
                onClick={launchPayment}
                className="flex-1 rounded-lg bg-[var(--dash-primary)] py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Lançar pagamento
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-800">
            Valor completo — pode fechar a comanda.
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--card-border)] py-2.5 text-sm font-semibold text-[#374151]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || !canConfirm}
            onClick={handleConfirm}
            className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'A processar…' : 'Receber e fechar'}
          </button>
        </div>
      </div>
    </div>
  )
}
