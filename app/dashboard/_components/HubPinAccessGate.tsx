'use client'

import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'
import {
  HUB_PIN_SHORTCUTS,
  isHubPinUnlockRemembered,
  rememberHubPinUnlock,
  type HubPinShortcut,
} from '@/lib/hub-shortcut-pin'

function HubShortcutPinPrompt({
  shortcut,
  expectedPin,
  onUnlock,
}: {
  shortcut: HubPinShortcut
  expectedPin: string
  onUnlock: () => void
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const meta = HUB_PIN_SHORTCUTS.find((item) => item.key === shortcut)
  const label = meta?.label ?? 'Atalho'

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pin !== expectedPin) {
      setError('PIN inválido.')
      return
    }
    setError(null)
    onUnlock()
  }

  return (
    <div className="flex min-h-[min(32rem,80dvh)] items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-[var(--card-border)] bg-white p-6 text-center shadow-xl shadow-black/[0.08]"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9ca3af]">
          Acesso protegido
        </p>
        <h1 className="mt-2 font-brand text-2xl font-bold text-[#1a1614]">
          {label}
        </h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          Digite o PIN de 4 números para abrir este atalho.
        </p>
        <input
          type="password"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
            if (error) setError(null)
          }}
          placeholder="0000"
          inputMode="numeric"
          maxLength={4}
          autoFocus
          className="mt-5 w-full rounded-2xl border border-[var(--card-border)] px-4 py-3 text-center text-2xl font-bold tracking-[0.35em] text-[#1a1614] outline-none transition focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/12"
        />
        {error ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <Link
            href="/dashboard"
            className="flex-1 rounded-xl border border-[var(--card-border)] py-2.5 text-sm font-semibold text-[#374151]"
          >
            Voltar
          </Link>
          <button
            type="submit"
            disabled={pin.length !== 4}
            className="flex-1 rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirmar PIN
          </button>
        </div>
      </form>
    </div>
  )
}

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

export function HubPinAccessGate({
  pinUnlockKey,
  pinRequired,
  shortcut,
  expectedPin,
  children,
}: {
  pinUnlockKey: string | null
  pinRequired: boolean
  shortcut: HubPinShortcut | null
  expectedPin: string
  children: React.ReactNode
}) {
  const isClient = useIsClient()
  const [manualUnlockKey, setManualUnlockKey] = useState<string | null>(null)

  const storageUnlocked =
    isClient && pinUnlockKey ? isHubPinUnlockRemembered(pinUnlockKey) : false
  const pinAllowed =
    !pinRequired ||
    !pinUnlockKey ||
    manualUnlockKey === pinUnlockKey ||
    storageUnlocked

  if (!pinRequired || pinAllowed) {
    return <>{children}</>
  }

  if (!isClient) {
    return (
      <div
        className="flex min-h-[min(32rem,80dvh)] items-center justify-center p-4"
        aria-hidden
      />
    )
  }

  if (!shortcut) {
    return <>{children}</>
  }

  return (
    <HubShortcutPinPrompt
      shortcut={shortcut}
      expectedPin={expectedPin}
      onUnlock={() => {
        rememberHubPinUnlock(pinUnlockKey)
        setManualUnlockKey(pinUnlockKey)
      }}
    />
  )
}
