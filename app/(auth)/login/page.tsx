'use client'

import Link from 'next/link'
import { useState } from 'react'
import { signIn } from '@/services/auth'
import { useRouter } from 'next/navigation'

const inputClass =
  'mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-vyria-navy outline-none transition-colors placeholder:text-vyria-navy-muted/70 focus:border-vyria-plum focus:ring-2 focus:ring-vyria-orange/20'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()

  async function handleLogin() {
    const { error } = await signIn(email, password)

    if (error) {
      alert(error.message)
      return
    }

    router.push('/dashboard')
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
