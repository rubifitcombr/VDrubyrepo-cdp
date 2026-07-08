'use client'

import { useBeginNavigation } from '@/app/_components/NavigationProgressProvider'
import { RouteLoadingFallback } from '@/app/_components/RouteLoadingFallback'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { setRememberLoginPreference } from '@/services/auth'
import { signInWithPasswordAction } from '@/services/auth.actions'
import { useSearchParams } from 'next/navigation'

const inputClass =
  'mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-vyria-navy outline-none transition-colors placeholder:text-vyria-navy-muted/70 focus:border-vyria-plum focus:ring-2 focus:ring-vyria-orange/20'

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  // Fluxo operacional: login -> hub -> atalho escolhido no hub.
  // Contrato anual pendente: nunca saltar o aceite (mesmo com ?next=outra rota).
  if (raw === '/dashboard/contrato' || raw.startsWith('/dashboard/contrato/')) {
    return '/dashboard/contrato'
  }
  if (raw === '/dashboard' || raw.startsWith('/dashboard/')) return '/dashboard'
  return raw
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberLogin, setRememberLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const beginNavigation = useBeginNavigation()
  const searchParams = useSearchParams()

  useEffect(() => {
    const raw = window.localStorage.getItem('vyria.rememberLogin')
    if (raw === '0') queueMicrotask(() => setRememberLogin(false))
  }, [])

  async function handleLogin() {
    setIsLoggingIn(true)
    try {
      const result = await signInWithPasswordAction(email.trim(), password)

      if (!result.ok) {
        alert(result.error)
        setIsLoggingIn(false)
        return
      }

      setRememberLoginPreference(rememberLogin)

      // Plano anual sem assinatura: abre o contrato; senão, hub.
      const destination =
        result.redirectTo === '/dashboard/contrato'
          ? '/dashboard/contrato'
          : safeNextPath(searchParams.get('next'))
      beginNavigation()
      window.location.assign(destination)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Erro ao iniciar sessão. Verifica as variáveis de ambiente do Supabase no deploy.'
      alert(message)
      setIsLoggingIn(false)
    }
  }

  return (
    <div className="relative rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl shadow-vyria-navy-deep/10 sm:p-8">
      <div className="mb-6 text-center sm:mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-vyria-plum">
          Engenharia de vendas local
        </p>
        <h1 className="font-brand mt-3 text-2xl font-bold tracking-tight text-vyria-navy">
          Entrar na conta
        </h1>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Acede ao teu painel de loja
        </p>
      </div>

      <div className="space-y-4">
        <fieldset disabled={isLoggingIn} className="min-w-0 space-y-4 border-0 p-0">
          <label className="block text-sm font-medium text-vyria-navy">
            Email
            <input
              className={inputClass}
              placeholder="tu@email.com"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <div>
            <label
              className="mt-1 block text-sm font-medium text-vyria-navy"
              htmlFor="vyria-login-password"
            >
              Senha
            </label>
            <input
              id="vyria-login-password"
              className={inputClass}
              placeholder="••••••••"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <input
                id="vyria-show-password-login"
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-[var(--card-border)] text-vyria-orange focus:ring-2 focus:ring-vyria-orange/35"
              />
              <label
                htmlFor="vyria-show-password-login"
                className="cursor-pointer text-sm text-vyria-navy-muted select-none"
              >
                Ver senha
              </label>
            </div>
            <Link
              href="/login/recuperar"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-vyria-plum/25 bg-vyria-plum/[0.06] px-4 py-3 text-sm font-semibold text-vyria-plum transition-colors hover:border-vyria-plum/40 hover:bg-vyria-plum/10 hover:text-vyria-orange"
            >
              Esqueci a senha — redefinir por email
            </Link>
          </div>

          <div className="rounded-xl border border-[var(--card-border)] bg-[#fafafa] px-4 py-3.5 shadow-inner shadow-black/[0.02]">
            <label
              htmlFor="vyria-remember-login"
              className="flex cursor-pointer items-start gap-3 sm:items-center"
            >
              <input
                id="vyria-remember-login"
                type="checkbox"
                checked={rememberLogin}
                onChange={(e) => setRememberLogin(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-[var(--card-border)] text-vyria-orange focus:ring-2 focus:ring-vyria-orange/35 sm:mt-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-vyria-navy">
                  Lembrar login
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-vyria-navy-muted">
                  Mantém a sessão neste aparelho ao fechar o separador (até 30 dias).
                  Desliga se estiveres num computador partilhado.
                </span>
              </span>
            </label>
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="btn-vyria-gradient mt-2 w-full rounded-xl py-3 text-sm font-semibold disabled:pointer-events-none disabled:opacity-75"
          >
            Entrar
          </button>
        </fieldset>
      </div>

      {isLoggingIn ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/75 px-6 text-center backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span
            className="h-10 w-10 shrink-0 animate-spin rounded-full border-[3px] border-vyria-plum/25 border-t-vyria-plum"
            aria-hidden
          />
          <p className="text-sm font-medium text-vyria-navy">A carregar…</p>
          <p className="max-w-[16rem] text-xs text-vyria-navy-muted">
            A iniciar sessão e a abrir o painel.
          </p>
        </div>
      ) : null}

      <div className="mt-8 space-y-3 text-center text-sm text-vyria-navy-muted">
        <p>
          <Link
            href="/login/recuperar"
            className="font-semibold text-vyria-plum underline-offset-2 hover:text-vyria-orange hover:underline"
          >
            Redefinir senha
          </Link>
          <span className="text-vyria-navy-muted/60"> · </span>
          <Link
            href="/register"
            className="font-semibold text-vyria-plum underline-offset-2 hover:text-vyria-orange hover:underline"
          >
            Criar conta
          </Link>
        </p>
        <p className="text-xs leading-relaxed text-vyria-navy-muted/90">
          Enviámos um link seguro para o teu email; o passo seguinte é definires a nova senha.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <RouteLoadingFallback
          height="compact"
          className="rounded-2xl border border-[var(--card-border)] bg-white shadow-xl shadow-vyria-navy-deep/10"
        />
      }
    >
      <LoginForm />
    </Suspense>
  )
}
