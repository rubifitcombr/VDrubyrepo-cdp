'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { setRememberLoginPreference, signIn } from '@/services/auth'
import { useRouter, useSearchParams } from 'next/navigation'

const inputClass =
  'mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-vyria-navy outline-none transition-colors placeholder:text-vyria-navy-muted/70 focus:border-vyria-plum focus:ring-2 focus:ring-vyria-orange/20'

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return raw
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberLogin, setRememberLogin] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const raw = window.localStorage.getItem('vyria.rememberLogin')
    if (raw === '0') setRememberLogin(false)
  }, [])

  async function handleLogin() {
    try {
      const { error } = await signIn(email, password)

      if (error) {
        alert(error.message)
        return
      }

      setRememberLoginPreference(rememberLogin)

      const next = safeNextPath(searchParams.get('next'))
      router.push(next)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Erro ao iniciar sessão. Verifica as variáveis de ambiente do Supabase no deploy.'
      alert(message)
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl shadow-vyria-navy-deep/10 sm:p-8">
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

        <label className="block text-sm font-medium text-vyria-navy">
          Senha
          <input
            className={inputClass}
            placeholder="••••••••"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-vyria-navy">
          <input
            type="checkbox"
            checked={rememberLogin}
            onChange={(e) => setRememberLogin(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--card-border)] text-vyria-orange focus:ring-vyria-orange/30"
          />
          Lembrar login
        </label>

        <button
          type="button"
          onClick={handleLogin}
          className="btn-vyria-gradient mt-2 w-full rounded-xl py-3 text-sm font-semibold"
        >
          Entrar
        </button>
      </div>

      <p className="mt-8 text-center text-sm text-vyria-navy-muted">
        Ainda sem conta?{' '}
        <Link
          href="/register"
          className="font-semibold text-vyria-plum hover:text-vyria-orange"
        >
          Criar conta
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-8 text-center text-sm text-vyria-navy-muted shadow-xl">
          A carregar…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
