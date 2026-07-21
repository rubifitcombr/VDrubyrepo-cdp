'use client'

import type { StoreOrderRow } from '@/lib/store-order'
import { comandaDisplayName } from '@/lib/order-payments'
import { parseTableFromNotes } from '@/lib/waiter-order-notes'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function normalizeComandaName(value: string): string {
  return value.trim().toLowerCase()
}

export function GarcomMesaComandasPanel({
  tableName,
  sector,
  comandas,
  activeOrderId,
  newComandaName,
  onNewComandaNameChange,
  onSelect,
  onStartNew,
  onClose,
}: {
  tableName: string
  sector: string
  comandas: StoreOrderRow[]
  activeOrderId: string | null
  newComandaName: string
  onNewComandaNameChange: (v: string) => void
  onSelect: (order: StoreOrderRow) => void
  onStartNew: () => void
  onClose: () => void
}) {
  const trimmedName = newComandaName.trim()
  const duplicateName =
    trimmedName.length > 0 &&
    comandas.some(
      (o) => normalizeComandaName(comandaDisplayName(o.customer_name)) === normalizeComandaName(trimmedName)
    )

  return (
    <div className="fixed inset-0 z-[88] flex items-end justify-center sm:items-center" role="dialog">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Fechar" onClick={onClose} />
      <div className="relative z-10 max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-[#1a1614]">Mesa {tableName}</h3>
            <p className="text-xs text-[#6b7280]">
              {sector} · {comandas.length} comanda{comandas.length === 1 ? '' : 's'} em aberto
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl leading-none text-[#6b7280] hover:bg-[#f3f4f6]"
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-sm text-[#4b5563]">
          Toque numa comanda existente para editar, ou crie outra com nome diferente.
        </p>

        <ul className="mt-3 space-y-2">
          {comandas.map((order) => {
            const label = comandaDisplayName(order.customer_name)
            const sel = activeOrderId === order.id
            return (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => onSelect(order)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    sel
                      ? 'border-[var(--dash-primary)] bg-[var(--dash-primary)]/5 ring-2 ring-[var(--dash-primary)]/20'
                      : 'border-[var(--card-border)] bg-white hover:border-[var(--dash-primary)]/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-[#1a1614]">{label}</p>
                    <p className="text-sm font-bold text-[var(--dash-primary)]">
                      {money.format(Number(order.total) || 0)}
                    </p>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[#6b7280]">
                    {order.items_summary || 'Sem itens'}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-4 rounded-xl border border-[var(--dash-primary)]/25 bg-[var(--dash-primary)]/[0.04] p-3">
          <p className="text-xs font-bold text-[#1a1614]">Nova comanda nesta mesa</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#6b7280]">
            Dê um nome para separar a conta (ex.: convidado ou família) e abra o cardápio para lançar
            os produtos.
          </p>
          <label className="mt-3 block text-[11px] font-medium text-[#6b7280]">
            Nome da comanda
            <input
              value={newComandaName}
              onChange={(e) => onNewComandaNameChange(e.target.value)}
              placeholder="Ex.: João, Família Silva"
              className="mt-1 w-full rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-sm"
            />
          </label>
          {duplicateName ? (
            <p className="mt-2 text-[11px] font-medium text-amber-800">
              Já existe uma comanda com este nome nesta mesa. Escolha outro nome.
            </p>
          ) : null}
          <button
            type="button"
            disabled={duplicateName}
            onClick={onStartNew}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white shadow-sm shadow-[var(--dash-primary)]/25 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
            </svg>
            Abrir cardápio e lançar
          </button>
        </div>
      </div>
    </div>
  )
}

export function comandaListSubtitle(order: StoreOrderRow): string {
  const mesa = parseTableFromNotes(order.notes)
  const name = comandaDisplayName(order.customer_name, '')
  const parts = [mesa ? `Mesa ${mesa}` : '', name].filter(Boolean)
  return parts.join(' · ') || 'Comanda'
}
