'use client'

import { useBeginNavigation } from '@/app/_components/NavigationProgressProvider'
import Link from 'next/link'
import { useState } from 'react'
import { signIn } from '@/services/auth'
import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import { operationModeLabel } from '@/lib/merchant-operation-mode'
import { useRouter } from 'next/navigation'

const inputClass =
  'mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-vyria-navy outline-none transition-colors placeholder:text-vyria-navy-muted/70 focus:border-vyria-plum focus:ring-2 focus:ring-vyria-orange/20'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [storeName, setStoreName] = useState('')
  const [phone, setPhone] = useState('')
  const [operationMode, setOperationMode] = useState<MerchantOperationMode | ''>('')
  const [showPassword, setShowPassword] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const beginNavigation = useBeginNavigation()
  const router = useRouter()

  async function handleRegister() {
    const name = storeName.trim()
    const mail = email.trim()
    if (!name || !mail || password.length < 6) {
      alert('Preenche o nome da loja, email válido e senha com pelo menos 6 caracteres.')
      return
    }
    if (!operationMode) {
      alert('Escolhe o modelo de operação da loja (Delivery, Presencial ou Híbrido).')
      return
    }

    setIsRegistering(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: mail,
          password,
          name,
          phone: phone.trim() || null,
          operation_mode: operationMode,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }
      if (!res.ok || !json.ok) {
        alert(json.error || 'Não foi possível criar a conta.')
        setIsRegistering(false)
        return
      }

      const { error: signInErr } = await signIn(mail, password)
      if (signInErr) {
        alert(
          'Conta criada. Entra agora com o mesmo email e senha em «Entrar».' +
            (signInErr.message ? ` (${signInErr.message})` : '')
        )
        beginNavigation()
        router.push('/login')
        return
      }

      try {
        await fetch('/api/auth/notificar-cadastro', { method: 'POST', credentials: 'include' })
      } catch {
        /* email opcional */
      }

      beginNavigation()
      router.push('/acesso-suspenso?error=pendente')
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Erro ao criar conta. Verifica as variáveis de ambiente do Supabase no deploy.'
      alert(message)
      setIsRegistering(false)
    }
  }

  return (
    <div className="relative rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl shadow-vyria-navy-deep/10 sm:p-8">
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
        <fieldset disabled={isRegistering} className="space-y-4 min-w-0 border-0 p-0">
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

          <div>
            <label className="block text-sm font-medium text-vyria-navy">
              Modelo de operação
              <select
                className={inputClass}
                value={operationMode}
                onChange={(e) => {
                  const v = e.target.value
                  setOperationMode(
                    v === '' ? '' : (v as MerchantOperationMode)
                  )
                }}
                aria-required
              >
                <option value="">Seleciona como a loja opera…</option>
                <option value="delivery">{operationModeLabel('delivery')}</option>
                <option value="presencial">{operationModeLabel('presencial')}</option>
                <option value="hibrido">{operationModeLabel('hibrido')}</option>
              </select>
            </label>
            <p className="mt-1.5 text-xs leading-snug text-vyria-navy-muted">
              Isto ajusta o menu do painel (ex.: Delivery sem PDV no menu; Presencial com
              PDV). Podes alterar depois com o suporte se precisares.
            </p>
          </div>

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
            <label className="block text-sm font-medium text-vyria-navy">
              Senha
              <input
                className={inputClass}
                placeholder="Mínimo 6 caracteres"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="vyria-show-password-register"
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-[var(--card-border)] text-vyria-orange focus:ring-2 focus:ring-vyria-orange/35"
              />
              <label
                htmlFor="vyria-show-password-register"
                className="cursor-pointer text-sm text-vyria-navy-muted select-none"
              >
                Ver senha
              </label>
            </div>
            <p className="mt-2 text-right text-xs">
              <Link href="/login/recuperar" className="font-semibold text-vyria-plum hover:text-vyria-orange">
                Já tens conta mas esqueceste-te da senha?
              </Link>
            </p>
          </div>

          <button
            type="button"
            onClick={handleRegister}
            disabled={isRegistering}
            className="btn-vyria-gradient mt-2 w-full rounded-xl py-3 text-sm font-semibold disabled:pointer-events-none disabled:opacity-75"
          >
            Criar conta
          </button>
        </fieldset>
      </div>

      {isRegistering ? (
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
            A guardar conta e a preparar a loja. Pode levar alguns segundos — não
            feches esta página.
          </p>
        </div>
      ) : null}

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
