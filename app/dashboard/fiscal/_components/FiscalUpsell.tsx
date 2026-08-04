'use client'

import { useState } from 'react'
import { buildWhatsAppLink } from '@/lib/whatsapp-number'
import type { FiscalStatus } from '@/lib/fiscal'

const FISCAL_PRICE_LABEL = 'R$ 39,90/mês'

const BENEFITS = [
  'Emissão de NFC-e com um clique, direto no painel de pedidos.',
  'Integração automática com a SEFAZ e envio do certificado A1.',
  'DANFE/QR Code prontos para o cliente e histórico de notas.',
]

export function FiscalUpsell({
  status,
  showBeginButton = false,
  onBeginConfig,
}: {
  status: FiscalStatus
  showBeginButton?: boolean
  onBeginConfig?: () => void
}) {
  const [showCheckout, setShowCheckout] = useState(false)

  const checkoutUrl = process.env.NEXT_PUBLIC_FISCAL_CHECKOUT_URL?.trim() || ''
  const supportHref = buildWhatsAppLink(
    process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || '',
    'Olá! Quero ativar o módulo Vyria Fiscal (NFC-e) na minha loja.'
  )

  const isBlocked = status === 'bloqueado'

  function handleActivate() {
    if (checkoutUrl) {
      setShowCheckout(true)
      return
    }
    if (supportHref) {
      window.open(supportHref, '_blank', 'noopener,noreferrer')
      return
    }
    window.location.assign('/dashboard/planos')
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white shadow-sm shadow-black/[0.04]">
      <div className="bg-gradient-to-br from-[var(--dash-primary)] to-vyria-plum px-6 py-8 text-white md:px-10 md:py-10">
        <h2 className="font-brand text-2xl font-bold tracking-tight md:text-3xl">
          Módulo Vyria Fiscal
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/90 md:text-base">
          Emita notas fiscais (NFC-e) direto pelo seu sistema com um clique. Integração automática
          com a SEFAZ.
        </p>
      </div>

      <div className="px-6 py-6 md:px-10 md:py-8">
        {isBlocked ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Seu módulo fiscal está suspenso. Reative para voltar a emitir NFC-e.
          </p>
        ) : null}

        <ul className="space-y-2.5">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-[#374151]">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </span>
              {b}
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold tracking-tight text-[#1a1614]">{FISCAL_PRICE_LABEL}</span>
          <span className="text-sm text-[#9ca3af]">cancele quando quiser</span>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleActivate}
            className="flex-1 rounded-xl bg-[var(--dash-primary)] px-6 py-3 text-center text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
          >
            {isBlocked ? `Reativar por ${FISCAL_PRICE_LABEL}` : `Ativar agora por ${FISCAL_PRICE_LABEL}`}
          </button>
          {showBeginButton && onBeginConfig ? (
            <button
              type="button"
              onClick={onBeginConfig}
              className="flex-1 rounded-xl border-2 border-[var(--dash-primary)] bg-white px-6 py-3 text-center text-sm font-semibold text-[var(--dash-primary)] transition hover:bg-[var(--dash-primary)]/5"
            >
              Já comprei — configurar
            </button>
          ) : null}
          {supportHref ? (
            <a
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-xl border border-[var(--card-border)] bg-white px-6 py-3 text-center text-sm font-semibold text-[#374151] transition hover:bg-[#f9fafb]"
            >
              Falar com suporte
            </a>
          ) : (
            <a
              href="/dashboard/planos"
              className="flex-1 rounded-xl border border-[var(--card-border)] bg-white px-6 py-3 text-center text-sm font-semibold text-[#374151] transition hover:bg-[#f9fafb]"
            >
              Ver planos / suporte
            </a>
          )}
        </div>

        <p className="mt-4 text-xs text-[#9ca3af]">
          Após a confirmação do pagamento, clique em <strong>Já comprei — configurar</strong> para
          iniciar o checklist fiscal e solicitar a ativação.
        </p>
      </div>

      {showCheckout && checkoutUrl ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal>
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Fechar checkout"
            onClick={() => setShowCheckout(false)}
          />
          <div className="relative z-10 flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--card-border)] px-4 py-3">
              <p className="text-sm font-bold text-[#1a1614]">Ativar Vyria Fiscal</p>
              <div className="flex items-center gap-1.5">
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-[var(--card-border)] px-2.5 py-1 text-xs font-semibold text-[var(--dash-primary)] hover:bg-[#f9fafb]"
                >
                  Abrir em nova aba
                </a>
                <button
                  type="button"
                  onClick={() => setShowCheckout(false)}
                  className="rounded-lg px-2 py-1 text-sm font-semibold text-[#6b7280] hover:bg-[#f3f4f6]"
                >
                  Fechar
                </button>
              </div>
            </div>
            <iframe
              src={checkoutUrl}
              title="Checkout Vyria Fiscal"
              className="h-full w-full flex-1 border-0"
              allow="payment"
            />
          </div>
        </div>
      ) : null}
    </section>
  )
}
