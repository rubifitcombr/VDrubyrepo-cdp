'use client'

import Link from 'next/link'
import { useState } from 'react'
import { requestPasswordResetEmail } from '@/services/auth'

const inputClass =
  'mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-vyria-navy outline-none transition-colors placeholder:text-vyria-navy-muted/70 focus:border-vyria-plum focus:ring-2 focus:ring-vyria-orange/20'

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    const mail = email.trim()
    if (!mail) {
      alert('Indica o email da conta.')
      return
    }
    setBusy(true)
    try {
      const { error } = await requestPasswordResetEmail(mail)
      if (error) {
        alert(error.message)
        setBusy(false)
        return
      }
      setDone(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro de rede.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl shadow-vyria-navy-deep/10 sm:p-8">
      <div className="mb-6 text-center sm:mb-8">
        <h1 className="font-brand text-2xl font-bold tracking-tight text-vyria-navy">
          Recuperar senha
        </h1>
        <p className="mt-2 text-sm text-vyria-navy-muted">
          Enviámos um link seguro para o teu email (se existir conta com este endereço).
        </p>
      </div>

      {done ? (
        <div className="space-y-4 text-center">
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Se existir uma conta para <span className="font-semibold">{email.trim()}</span>, verifica a caixa de entrada e
            a pasta de spam. O link expira em poucas horas.
          </p>
          <Link
            href="/login"
            className="inline-flex w-full justify-center rounded-xl bg-[var(--dash-primary)] py-3 text-sm font-semibold text-white hover:brightness-105"
          >
            Voltar ao login
          </Link>
        </div>
      ) : (
        <>
          <fieldset disabled={busy} className="min-w-0 space-y-4 border-0 p-0">
            <label className="block text-sm font-medium text-vyria-navy">
              Email da conta
              <input
                className={inputClass}
                placeholder="tu@email.com"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={busy}
              className="btn-vyria-gradient mt-2 w-full rounded-xl py-3 text-sm font-semibold disabled:pointer-events-none disabled:opacity-75"
            >
              {busy ? 'A enviar…' : 'Enviar link por email'}
            </button>
          </fieldset>
          <p className="mt-8 text-center text-sm text-vyria-navy-muted">
            <Link href="/login" className="font-semibold text-vyria-plum hover:text-vyria-orange">
              Voltar ao login
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
