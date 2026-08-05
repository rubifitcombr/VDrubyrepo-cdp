'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SubscriptionBillingUiState } from '@/lib/subscription-billing-types'

export function SubscriptionLockOverlay({
  billing,
}: {
  billing: SubscriptionBillingUiState
}) {
  const [copied, setCopied] = useState(false)
  const confirmedRef = useRef(false)

  const pollStatus = useCallback(async () => {
    if (confirmedRef.current) return
    try {
      const resp = await fetch('/api/billing/subscription/status', { cache: 'no-store' })
      const data = (await resp.json().catch(() => ({}))) as { confirmed?: boolean }
      if (data.confirmed) {
        confirmedRef.current = true
        window.location.reload()
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void pollStatus()
    const t = window.setInterval(() => void pollStatus(), 5000)
    return () => window.clearInterval(t)
  }, [pollStatus])

  async function copyPix() {
    if (!billing.pixCopyPaste) return
    try {
      await navigator.clipboard.writeText(billing.pixCopyPaste)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copia o código PIX:', billing.pixCopyPaste)
    }
  }

  const title = billing.copy?.title ?? 'Painel bloqueado por mensalidade em aberto'
  const body =
    billing.copy?.body ??
    'Regularize o PIX para voltar a operar. O acesso será liberado automaticamente após a confirmação do pagamento.'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1a1614]/75 p-4 backdrop-blur-sm">
      <div className="pointer-events-auto w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>
        <h2 className="mt-5 text-center font-brand text-xl font-bold text-[#1a1614]">{title}</h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-[#6b7280]">{body}</p>

        {billing.amountLabel ? (
          <p className="mt-6 text-center text-3xl font-bold text-[#1a1614]">{billing.amountLabel}</p>
        ) : null}

        {billing.pixQrBase64 ? (
          <img
            src={`data:image/png;base64,${billing.pixQrBase64}`}
            alt="QR Code PIX"
            className="mx-auto mt-6 h-52 w-52 rounded-2xl border border-[var(--card-border)]"
          />
        ) : null}

        {billing.pixCopyPaste ? (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-medium text-[#6b7280]">PIX copia e cola</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={billing.pixCopyPaste}
                className="min-w-0 flex-1 rounded-xl border border-[var(--card-border)] bg-[#f9fafb] px-3 py-2.5 text-xs"
              />
              <button
                type="button"
                onClick={() => void copyPix()}
                className="shrink-0 rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white"
              >
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        ) : null}

        <p className="mt-5 text-center text-xs text-[#6b7280]">
          Verificando pagamento automaticamente…
        </p>
      </div>
    </div>
  )
}
