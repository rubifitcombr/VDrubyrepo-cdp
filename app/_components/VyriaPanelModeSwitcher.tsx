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
    const isAdmin = props.currentMode === 'admin'
    return (
      <div className="rounded-xl border border-white/15 bg-white/[0.07] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          Painel
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={isAdmin}
          aria-busy={pending}
          disabled={pending}
          onClick={() => void setMode(isAdmin ? 'lojista' : 'admin')}
          className="mt-2 flex w-full items-center gap-3 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.1] disabled:opacity-60"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold text-white/90">
              {isAdmin ? 'Modo admin ativo' : 'Modo lojista'}
            </span>
            <span className="mt-0.5 block text-[10px] leading-snug text-white/50">
              {isAdmin
                ? 'Alterna para usar o painel como lojista.'
                : 'Alterna para voltar ao painel administrativo.'}
            </span>
          </span>
          <span
            className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${
              isAdmin ? 'bg-emerald-500/90' : 'bg-white/25'
            }`}
          >
            <span
              className={`pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                isAdmin ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
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
