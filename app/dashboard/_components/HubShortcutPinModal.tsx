'use client'

import { useState } from 'react'
import {
  HUB_PIN_SHORTCUTS,
  type HubPinShortcut,
} from '@/lib/hub-shortcut-pin'

export function HubShortcutPinModal({
  shortcut,
  onCancel,
  onConfirm,
  externalError = null,
  verifying = false,
}: {
  shortcut: HubPinShortcut
  onCancel: () => void
  onConfirm: (pin: string) => boolean
  externalError?: string | null
  verifying?: boolean
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const displayError = externalError || error
  const meta = HUB_PIN_SHORTCUTS.find((item) => item.key === shortcut)
  const label = meta?.label ?? 'Atalho'

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (verifying) return
    setError(null)
    const ok = onConfirm(pin)
    // `true` = verificação assíncrona iniciada ou sucesso síncrono; não mostrar erro local.
    if (!ok && !externalError) {
      setError('PIN inválido.')
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Fechar"
        onClick={onCancel}
      />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-sm rounded-3xl border border-[var(--card-border)] bg-white p-6 text-center shadow-xl shadow-black/[0.08]"
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
          disabled={verifying}
          className="mt-5 w-full rounded-2xl border border-[var(--card-border)] px-4 py-3 text-center text-2xl font-bold tracking-[0.35em] text-[#1a1614] outline-none transition focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/12 disabled:opacity-60"
        />
        {displayError ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {displayError}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[var(--card-border)] py-2.5 text-sm font-semibold text-[#374151]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pin.length !== 4 || verifying}
            className="flex-1 rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {verifying ? 'A verificar…' : 'Confirmar PIN'}
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 inline-flex text-xs font-semibold text-[#6b7280] hover:text-[#1a1614]"
        >
          Voltar ao hub
        </button>
      </form>
    </div>
  )
}
