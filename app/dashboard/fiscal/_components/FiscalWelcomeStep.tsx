'use client'

import { useState } from 'react'
import { buildWhatsAppLink } from '@/lib/whatsapp-number'

const SEFAZ_STEPS = [
  'Acesse o portal da SEFAZ do estado onde o CNPJ está registrado.',
  'Faça login com o certificado digital A1 do emitente.',
  'Procure por "Credenciamento NFC-e" ou "Autorização de uso — NFC-e (modelo 65)".',
  'Solicite o credenciamento para emissão de NFC-e.',
  'Após aprovação, gere o CSC (Código de Segurança do Contribuinte): CSC ID e CSC Token.',
  'Guarde o CSC — você vai informá-lo na configuração do Vyria Fiscal.',
]

export function FiscalWelcomeStep({
  storeId,
  onStarted,
}: {
  storeId: string
  onStarted: () => void
}) {
  const [answer, setAnswer] = useState<'sim' | 'nao' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supportHref = buildWhatsAppLink(
    process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || '',
    'Olá! Preciso de ajuda com o credenciamento NFC-e na SEFAZ para usar o Vyria Fiscal.'
  )

  async function handleContinue() {
    if (answer !== 'sim') return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/store/fiscal/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ storeId, sefazCredenciado: true }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error || 'Não foi possível iniciar a configuração.')
        return
      }
      onStarted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
      <h2 className="text-xl font-bold text-[#1a1614]">Bem-vindo ao Vyria Fiscal</h2>
      <p className="mt-2 text-sm text-[#6b7280]">
        Antes de configurar, confirme que sua empresa já possui credenciamento NFC-e na SEFAZ.
        A Vyria envia os dados para a Brasil NFe usando a conta master — quem emite a nota é o{' '}
        <strong>CNPJ do seu restaurante</strong>, não o da Vyria.
      </p>

      <div className="mt-6">
        <p className="text-sm font-semibold text-[#1a1614]">
          Passo 1 — Você já possui credenciamento NFC-e na SEFAZ?
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm has-[:checked]:border-emerald-400 has-[:checked]:bg-emerald-50/50">
            <input
              type="radio"
              name="sefaz"
              checked={answer === 'sim'}
              onChange={() => setAnswer('sim')}
            />
            Sim, já tenho credenciamento e CSC
          </label>
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50/50">
            <input
              type="radio"
              name="sefaz"
              checked={answer === 'nao'}
              onChange={() => setAnswer('nao')}
            />
            Não, ainda preciso credenciar
          </label>
        </div>
      </div>

      {answer === 'nao' ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Como obter o credenciamento</p>
          <p className="mt-1 text-xs text-amber-800">
            Nenhuma API consegue gerar credenciamento ou CSC automaticamente — isso é feito
            diretamente na SEFAZ do seu estado.
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-amber-900">
            {SEFAZ_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {supportHref ? (
            <a
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100/50"
            >
              Falar com suporte Vyria
            </a>
          ) : null}
        </div>
      ) : null}

      {answer === 'sim' ? (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleContinue()}
            className="rounded-xl bg-[var(--dash-primary)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 hover:brightness-105 disabled:opacity-50"
          >
            {busy ? 'Iniciando…' : 'Começar configuração'}
          </button>
          <p className="text-xs text-[#6b7280]">
            Você poderá preencher dados da empresa, certificado, CSC e produtos fiscais.
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  )
}
