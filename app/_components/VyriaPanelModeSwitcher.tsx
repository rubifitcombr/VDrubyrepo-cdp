'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { VyriaPanelMode } from '@/lib/vyria-panel-mode'

type Props =
  | { variant: 'dashboard'; currentMode: VyriaPanelMode }
  | { variant: 'admin'; currentMode: VyriaPanelMode }

export function VyriaPanelModeSwitcher(props: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function setMode(mode: VyriaPanelMode) {
    if (mode === props.currentMode) return
    setPending(true)
    try {
      const res = await fetch('/api/auth/panel-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null
        alert(j?.error ?? 'Não foi possível alterar o modo.')
        return
      }
      router.refresh()
      if (mode === 'admin') {
        router.push('/admin/lojistas')
      } else {
        router.push('/dashboard')
      }
    } finally {
      setPending(false)
    }
  }

  if (props.variant === 'admin') {
    return (
      <div className="flex flex-col gap-2 border-t border-white/10 px-2 py-3">
        <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-white/45">
          Conta Vyria
        </p>
        <span className="rounded-lg bg-white/10 px-2 py-1.5 text-center text-[11px] font-medium text-white/90">
          Modo admin ativo
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => void setMode('lojista')}
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {pending ? 'A alterar…' : 'Usar como lojista'}
        </button>
      </div>
    )
  }

  const isAdmin = props.currentMode === 'admin'

  return (
    <div className="space-y-2 rounded-xl border border-white/15 bg-white/[0.06] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
        Conta Vyria
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-white/85">
          {isAdmin ? 'Modo admin' : 'Modo lojista'}
        </span>
      </div>
      {isAdmin ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => router.push('/admin/lojistas')}
            className="w-full rounded-lg bg-[var(--dash-primary)] px-3 py-2 text-center text-xs font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-50"
          >
            Ir ao painel Vyria Admin
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void setMode('lojista')}
            className="w-full rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 disabled:opacity-50"
          >
            {pending ? 'A alterar…' : 'Mudar para modo lojista'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => void setMode('admin')}
          className="w-full rounded-lg bg-[var(--dash-primary)] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-50"
        >
          {pending ? 'A alterar…' : 'Entrar em modo admin'}
        </button>
      )}
    </div>
  )
}
