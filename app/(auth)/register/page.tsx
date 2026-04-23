'use client'

import Link from 'next/link'
import { useState } from 'react'
import { signUp } from '@/services/auth'
import { createStore } from '@/services/store'
import { upsertUsuarioMirror } from '@/services/usuarios'
import { useRouter } from 'next/navigation'

const inputClass =
  'mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-vyria-navy outline-none transition-colors placeholder:text-vyria-navy-muted/70 focus:border-vyria-plum focus:ring-2 focus:ring-vyria-orange/20'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [storeName, setStoreName] = useState('')
  const [phone, setPhone] = useState('')
  const router = useRouter()

  async function handleRegister() {
    const name = storeName.trim()
    const mail = email.trim()
    if (!name || !mail || password.length < 6) {
      alert('Preenche o nome da loja, email válido e senha com pelo menos 6 caracteres.')
      return
    }

    try {
      const { data, error } = await signUp(mail, password)

      if (error) {
        const raw = error.message
        alert(
          raw.includes('Database error saving new user')
            ? 'Erro ao criar conta na base de dados. Executa no Supabase (SQL Editor) o ficheiro supabase/migrations/20260425120000_signup_usuarios_sem_trigger_rls.sql do repositório, ou contacta o suporte.'
            : raw
        )
        return
      }

      const userId = data.user?.id

      if (userId) {
        const userEmail = data.user?.email ?? mail
        const { error: mirrorErr } = await upsertUsuarioMirror(userId, userEmail)

        if (mirrorErr) {
          let recovered = false
          try {
            const syncRes = await fetch('/api/auth/sync-usuario', {
              method: 'POST',
              credentials: 'include',
            })
            if (syncRes.ok) {
              const body = (await syncRes.json()) as {
                ok?: boolean
                skipped?: boolean
              }
              if (body.ok && !body.skipped) recovered = true
            }
          } catch {
            /* ignore */
          }
          if (!recovered) {
            alert(
              'Não foi possível guardar o perfil na base de dados. Executa no Supabase o SQL `20260425120000_signup_usuarios_sem_trigger_rls.sql` e confirma que SUPABASE_SERVICE_ROLE_KEY está definida no deploy (ou confirma o email da conta se o projeto exigir).'
            )
            return
          }
        }

        const { error: storeErr } = await createStore(userId, name, phone.trim() || undefined)
        if (storeErr) {
          alert(storeErr.message || 'Erro ao criar loja.')
          return
        }
        try {
          await fetch('/api/auth/notificar-cadastro', { method: 'POST', credentials: 'include' })
        } catch {
          /* email opcional */
        }
        router.push('/acesso-suspenso?error=pendente')
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Erro ao criar conta. Verifica as variáveis de ambiente do Supabase no deploy.'
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
          Criar conta
        </h1>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Loja e painel num só passo
        </p>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-medium text-vyria-navy">
          Nome da loja
          <input
            className={inputClass}
            placeholder="Ex.: Padaria Central"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium text-vyria-navy">
          Telefone (WhatsApp)
          <input
            className={inputClass}
            placeholder="Ex.: 62999999999"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>

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
            placeholder="Mínimo 6 caracteres"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button
          type="button"
          onClick={handleRegister}
          className="btn-vyria-gradient mt-2 w-full rounded-xl py-3 text-sm font-semibold"
        >
          Criar conta
        </button>
      </div>

      <p className="mt-8 text-center text-sm text-vyria-navy-muted">
        Já tens conta?{' '}
        <Link
          href="/login"
          className="font-semibold text-vyria-plum hover:text-vyria-orange"
        >
          Entrar
        </Link>
      </p>
    </div>
  )
}
