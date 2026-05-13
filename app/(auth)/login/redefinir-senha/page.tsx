'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updatePassword } from '@/services/auth'
import { useBeginNavigation } from '@/app/_components/NavigationProgressProvider'
import { RouteLoadingFallback } from '@/app/_components/RouteLoadingFallback'

const inputClass =
  'mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-vyria-navy outline-none transition-colors placeholder:text-vyria-navy-muted/70 focus:border-vyria-plum focus:ring-2 focus:ring-vyria-orange/20'

function RedefinirSenhaForm() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'invalid'>('loading')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const beginNavigation = useBeginNavigation()

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    let invalidTimer: number | undefined

    function markReady() {
      if (cancelled) return
      if (invalidTimer !== undefined) {
        window.clearTimeout(invalidTimer)
        invalidTimer = undefined
      }
      setPhase('ready')
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY') {
        markReady()
      }
    })

    const code = searchParams.get('code')
    const hash = typeof window !== 'undefined' ? window.location.hash : ''

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (
        data.session &&
        !code &&
        !hash.includes('type=recovery') &&
        !hash.includes('access_token')
      ) {
        router.replace('/dashboard/settings#conta-senha')
      }
    })

    if (code) {
      void supabase.auth.exchangeCodeForSession(window.location.href).then(({ error }) => {
        if (cancelled) return
        if (!error) markReady()
      })
    }

    invalidTimer = window.setTimeout(() => {
      if (cancelled) return
      setPhase((p) => (p === 'loading' ? 'invalid' : p))
    }, 8000)

    return () => {
      cancelled = true
      if (invalidTimer !== undefined) {
        window.clearTimeout(invalidTimer)
      }
      sub.subscription.unsubscribe()
    }
  }, [searchParams, router])

  async function handleSave() {
    if (password.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== password2) {
      alert('As senhas não coincidem.')
      return
    }
    setBusy(true)
    try {
      const { error } = await updatePassword(password)
      if (error) {
        alert(error.message)
        setBusy(false)
        return
      }
      beginNavigation()
      router.push('/dashboard')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao guardar.')
      setBusy(false)
    }
  }

  if (phase === 'invalid') {
    return (
      <div className="relative rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl sm:p-8">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">Link inválido ou expirado</h1>
        <p className="mt-2 text-sm text-vyria-navy-muted">
          Pede um novo email ou inicia sessão se já tiveres conta.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/login/recuperar"
            className="inline-flex justify-center rounded-xl bg-[var(--dash-primary)] px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Pedir novo link
          </Link>
          <Link
            href="/login"
            className="inline-flex justify-center rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm font-semibold text-vyria-navy"
          >
            Login
          </Link>
        </div>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div className="relative flex min-h-[12rem] flex-col items-center justify-center rounded-2xl border border-[var(--card-border)] bg-white p-8 shadow-xl">
        <span
          className="h-10 w-10 shrink-0 animate-spin rounded-full border-[3px] border-vyria-plum/25 border-t-vyria-plum"
          aria-hidden
        />
        <p className="mt-4 text-sm text-vyria-navy-muted">A validar o link…</p>
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl shadow-vyria-navy-deep/10 sm:p-8">
      <h1 className="font-brand text-center text-2xl font-bold tracking-tight text-vyria-navy">
        Nova senha
      </h1>
      <p className="mt-2 text-center text-sm text-vyria-navy-muted">
        Escolhe uma senha segura para a tua conta Vyria.
      </p>

      <fieldset disabled={busy} className="mt-6 min-w-0 space-y-4 border-0 p-0">
        <label className="block text-sm font-medium text-vyria-navy">
          Nova senha
          <input
            className={inputClass}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-vyria-navy">
          Confirmar senha
          <input
            className={inputClass}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-vyria-navy-muted">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--card-border)]"
          />
          Ver senha
        </label>
        <button
          type="button"
          onClick={() => void handleSave()}
          className="btn-vyria-gradient w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-75"
        >
          {busy ? 'A guardar…' : 'Guardar e entrar no painel'}
        </button>
      </fieldset>
    </div>
  )
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense
      fallback={
        <RouteLoadingFallback
          height="compact"
          className="rounded-2xl border border-[var(--card-border)] bg-white shadow-xl"
        />
      }
    >
      <RedefinirSenhaForm />
    </Suspense>
  )
}
