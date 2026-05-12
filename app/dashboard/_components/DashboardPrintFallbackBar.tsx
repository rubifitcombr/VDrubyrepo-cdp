'use client'

import { useCallback, useEffect, useState } from 'react'
import { markOrderTicketPrintDelivered } from '@/lib/order-print-window'
import {
  readPendingThermalPrintQueue,
  removePendingThermalPrint,
  reopenQueuedThermalPrint,
  type PendingThermalPrintRow,
} from '@/lib/thermal-print-window'

/**
 * Quando o browser bloqueia `window.open` (impressão automática assíncrona no mobile),
 * o cupom fica na fila em `sessionStorage`. Esta barra pede um toque para abrir o pop-up.
 */
export function DashboardPrintFallbackBar() {
  const [rows, setRows] = useState<PendingThermalPrintRow[]>([])

  const refresh = useCallback(() => {
    setRows(readPendingThermalPrintQueue())
  }, [])

  useEffect(() => {
    refresh()
    const on = () => refresh()
    window.addEventListener('vyria-pending-print', on as EventListener)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener('vyria-pending-print', on as EventListener)
      window.removeEventListener('storage', on)
    }
  }, [refresh])

  const latest = rows[rows.length - 1]
  if (!latest) return null

  const openLatest = () => {
    const r = reopenQueuedThermalPrint(latest)
    if (r === 'opened') {
      removePendingThermalPrint(latest.safeFilenameStem)
      if (latest.orderId) markOrderTicketPrintDelivered(latest.orderId)
      refresh()
    }
  }

  const dismiss = () => {
    removePendingThermalPrint(latest.safeFilenameStem)
    refresh()
  }

  const count = rows.length

  return (
    <div
      role="status"
      className="pointer-events-auto fixed bottom-0 left-0 right-0 z-[200] flex flex-wrap items-center justify-center gap-2 border-t border-amber-200 bg-amber-50 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-sm text-amber-950 shadow-[0_-4px_20px_rgba(0,0,0,0.12)]"
    >
      <span className="max-w-[min(100%,22rem)] text-center font-medium leading-snug">
        {count > 1
          ? `${count} cupons na fila. No telemóvel o pop-up costuma ser bloqueado — toque em «Abrir cupom».`
          : 'Cupom pronto. No telemóvel o pop-up costuma ser bloqueado — toque em «Abrir cupom» (ou use o .prn se foi transferido).'}
      </span>
      <button
        type="button"
        onClick={openLatest}
        className="shrink-0 rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-xs font-bold text-white shadow-sm"
      >
        Abrir cupom
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
      >
        Dispensar
      </button>
    </div>
  )
}
