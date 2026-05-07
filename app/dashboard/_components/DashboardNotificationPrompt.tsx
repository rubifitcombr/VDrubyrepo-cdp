'use client'

import { useEffect, useState } from 'react'

const NOTIFICATION_PREF_KEY = 'vyria-notifications-enabled'

function readNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const raw = window.localStorage.getItem(NOTIFICATION_PREF_KEY)
  return raw !== '0'
}

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
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setEnabled(readNotificationsEnabled())
    setPermission(currentPermission())
  }, [])

  async function setNotificationsState(nextEnabled: boolean) {
    setBusy(true)
    try {
      window.localStorage.setItem(NOTIFICATION_PREF_KEY, nextEnabled ? '1' : '0')
      setEnabled(nextEnabled)
      window.dispatchEvent(
        new CustomEvent('vyria-notifications-toggle', {
          detail: { enabled: nextEnabled },
        })
      )

      if (nextEnabled && typeof Notification !== 'undefined') {
        // Só solicita permissão quando o usuário ativar explicitamente.
        const newPermission =
          Notification.permission === 'default'
            ? await Notification.requestPermission()
            : Notification.permission
        setPermission(newPermission)
        window.dispatchEvent(new Event('vyria-enable-notifications'))
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-white px-2.5 py-1.5 shadow-sm">
      <span className="text-xs font-semibold text-[#4b5563]">Notificações</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? 'Desativar notificações' : 'Ativar notificações'}
        onClick={() => void setNotificationsState(!enabled)}
        disabled={busy || permission === 'unsupported'}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${
          enabled ? 'bg-[var(--dash-primary)]' : 'bg-[#e5e7eb]'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
      <span className="text-[11px] font-medium text-[#6b7280]">
        {permission === 'unsupported'
          ? 'Indisponível'
          : busy
            ? 'Salvando...'
            : enabled
              ? permission === 'denied'
                ? 'Bloqueado'
                : 'Ativo'
              : 'Desativo'}
      </span>
      {enabled && permission === 'denied' ? (
        <span className="hidden text-[11px] text-amber-700 sm:inline">
          Permissão bloqueada. Desbloqueie em: cadeado na barra de endereço → Notificações → Permitir.
        </span>
      ) : null}
    </div>
  )
}
