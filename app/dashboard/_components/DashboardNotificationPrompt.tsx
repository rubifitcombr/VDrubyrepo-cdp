'use client'

import { useState } from 'react'

function currentPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported'
  }
  return Notification.permission
}

export function DashboardNotificationPrompt() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    currentPermission()
  )
  const [busy, setBusy] = useState(false)

  if (permission === 'granted' || permission === 'unsupported') return null

  async function enableNotifications() {
    setBusy(true)
    try {
      if (typeof Notification !== 'undefined') {
        const p = await Notification.requestPermission()
        setPermission(p)
      }
      window.dispatchEvent(new Event('vyria-enable-notifications'))
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Ative as notificações deste aparelho para receber alerta com som quando
          chegar novo pedido.
        </p>
        <button
          type="button"
          onClick={() => void enableNotifications()}
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[var(--dash-primary)] px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {busy ? 'Ativando…' : 'Ativar notificações'}
        </button>
      </div>
    </div>
  )
}

