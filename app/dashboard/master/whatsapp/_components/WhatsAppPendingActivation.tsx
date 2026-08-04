'use client'

import { useEffect, useState } from 'react'

async function readJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('Resposta inválida do servidor.')
  }
}

export function WhatsAppPendingActivation({
  disabled,
  supportHref = null,
  initialContactPhone = '',
  initialNotes = '',
  requestedAt = null,
  onSubmitted,
  onError,
}: {
  disabled?: boolean
  supportHref?: string | null
  initialContactPhone?: string
  initialNotes?: string
  requestedAt?: string | null
  onSubmitted: () => void
  onError: (message: string) => void
}) {
  const [contactPhone, setContactPhone] = useState(initialContactPhone)
  const [notes, setNotes] = useState(initialNotes)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(Boolean(requestedAt))

  useEffect(() => {
    if (requestedAt) setSubmitted(true)
  }, [requestedAt])

  useEffect(() => {
    setContactPhone(initialContactPhone)
    setNotes(initialNotes)
  }, [initialContactPhone, initialNotes])

  async function handleSubmit() {
    if (!contactPhone.trim()) {
      onError('Informe o número WhatsApp Business da loja.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/master/whatsapp/request-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_phone: contactPhone.trim(),
          notes: notes.trim() || undefined,
        }),
      })
      const json = await readJsonResponse(res)
      if (!res.ok) {
        throw new Error(String(json.error || 'Falha ao enviar pedido.'))
      }
      setSubmitted(true)
      onSubmitted()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erro ao enviar pedido.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5">
        <p className="font-brand text-base font-bold text-emerald-950">Pedido enviado</p>
        <p className="mt-2 text-sm text-emerald-900">
          A equipa Vyria vai configurar o WhatsApp Business API no seu número. Quando estiver
          activo, esta página actualiza automaticamente — ou recarregue em alguns minutos.
        </p>
        <p className="mt-1 text-xs text-emerald-800/90">
          Prazo habitual: até 2 dias úteis.
        </p>
        {(requestedAt || submitted) ? (
          <p className="mt-2 text-xs text-emerald-800/80">
            Pedido registado
            {requestedAt
              ? ` em ${new Date(requestedAt).toLocaleString('pt-BR')}`
              : ' com sucesso'}
            .
          </p>
        ) : null}
        {supportHref ? (
          <a
            href={supportHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex text-sm font-semibold text-vyria-plum hover:underline"
          >
            Falar com suporte Vyria
          </a>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-6">
      <h3 className="font-brand text-lg font-bold text-vyria-navy">Solicitar activação</h3>
      <p className="mt-2 text-sm text-vyria-navy-muted">
        Informe o número WhatsApp Business da loja. A Vyria faz a configuração na Meta — você não
        precisa de conta Facebook nem de copiar códigos.
      </p>

      <div className="mt-5 space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-vyria-navy">WhatsApp Business da loja</span>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            disabled={disabled || submitting}
            placeholder="(11) 99999-9999"
            className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-vyria-navy">Observações (opcional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={disabled || submitting}
            rows={2}
            placeholder="Ex.: chip novo, já uso WhatsApp Business no celular…"
            className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={disabled || submitting}
          onClick={() => void handleSubmit()}
          className="inline-flex w-full items-center justify-center rounded-xl bg-vyria-plum px-5 py-3 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 sm:w-auto"
        >
          {submitting ? 'A enviar…' : 'Solicitar activação do WhatsApp'}
        </button>
      </div>
    </div>
  )
}

export { readJsonResponse }
