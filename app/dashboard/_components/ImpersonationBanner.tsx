'use client'

import { useState } from 'react'

export function ImpersonationBanner({ storeName }: { storeName: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function stop() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/impersonate/stop', {
        method: 'POST',
        credentials: 'include',
      })
      const data = (await res.json().catch(() => ({}))) as {
        redirectTo?: string
        error?: string
      }
      // Mesmo em erro, normalmente há um redirectTo (ex.: login) para sair com segurança.
      const dest = data.redirectTo || (res.ok ? '/admin/lojistas' : null)
      if (dest) {
        window.location.href = dest
        return
      }
      setError(data.error || 'Não foi possível voltar ao admin.')
    } catch {
      setError('Falha de rede ao voltar ao admin.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shrink-0 border-b border-amber-300 bg-amber-100 px-4 py-2.5 sm:px-5 md:px-6 lg:px-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-none flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm text-amber-950">
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M2.5 12C4 7.5 7.8 5 12 5s8 2.5 9.5 7c-1.5 4.5-5.3 7-9.5 7s-8-2.5-9.5-7Z"
            />
          </svg>
          <span>
            Estás a aceder como <strong>{storeName}</strong> (modo admin). As ações
            são feitas na conta deste lojista.
          </span>
        </p>
        <div className="flex items-center gap-3">
          {error ? (
            <span className="text-xs font-medium text-red-700">{error}</span>
          ) : null}
          <button
            type="button"
            onClick={() => void stop()}
            disabled={busy}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-950 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
          >
            {busy ? 'A voltar…' : 'Voltar ao admin'}
          </button>
        </div>
      </div>
    </div>
  )
}
