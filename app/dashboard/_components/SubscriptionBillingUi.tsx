'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SubscriptionBillingUiState } from '@/lib/subscription-billing-types'

function subscriptionBannerDismissKey(storeId: string, referenceMonth: string): string {
  return `vyria-sub-banner-dismiss:${storeId}:${referenceMonth}`
}

export function SubscriptionHubBanner({
  storeId,
  billing,
}: {
  storeId: string
  billing: SubscriptionBillingUiState
}) {
  const [dismissTick, setDismissTick] = useState(0)
  const [pixOpen, setPixOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const confirmedRef = useRef(false)

  const dismissed = useMemo(() => {
    void dismissTick
    if (!billing.showBanner || !billing.referenceMonth) return true
    if (typeof window === 'undefined') return true
    const key = subscriptionBannerDismissKey(storeId, billing.referenceMonth)
    return sessionStorage.getItem(key) === '1'
  }, [billing.referenceMonth, billing.showBanner, dismissTick, storeId])

  const dismiss = useCallback(() => {
    if (!billing.referenceMonth) return
    const key = subscriptionBannerDismissKey(storeId, billing.referenceMonth)
    sessionStorage.setItem(key, '1')
    setDismissTick((n) => n + 1)
  }, [billing.referenceMonth, storeId])

  const pollStatus = useCallback(async () => {
    if (confirmedRef.current) return
    try {
      const resp = await fetch('/api/billing/subscription/status', { cache: 'no-store' })
      const data = (await resp.json().catch(() => ({}))) as {
        confirmed?: boolean
      }
      if (data.confirmed) {
        confirmedRef.current = true
        window.location.reload()
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!pixOpen) return
    void pollStatus()
    const t = window.setInterval(() => void pollStatus(), 5000)
    return () => window.clearInterval(t)
  }, [pixOpen, pollStatus])

  if (!billing.showBanner || !billing.copy || dismissed) return null

  const tone = billing.copy.tone
  const toneClass =
    tone === 'critical'
      ? 'border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-950'
      : tone === 'urgent'
        ? 'border-amber-200 bg-amber-50/90 text-amber-950'
        : 'border-sky-200 bg-sky-50/90 text-sky-950'

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

  return (
    <>
      <div
        className={`relative z-30 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-sm shadow-sm ${toneClass}`}
      >
        <div className="min-w-0 flex-1 pr-8">
          <p className="font-semibold">{billing.copy.title}</p>
          <p className="mt-0.5 text-[13px] opacity-90">{billing.copy.body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {billing.amountLabel ? (
            <span className="rounded-lg bg-white/70 px-2.5 py-1 text-xs font-bold ring-1 ring-black/5">
              {billing.amountLabel}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setPixOpen(true)}
            className="rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-xs font-semibold text-white shadow-md"
          >
            Pagar com PIX
          </button>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-lg p-1 opacity-60 hover:bg-black/5 hover:opacity-100"
          aria-label="Fechar aviso até amanhã"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {pixOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-brand text-lg font-bold text-[#1a1614]">PIX da mensalidade</h2>
                <p className="mt-1 text-sm text-[#6b7280]">
                  Confirmação automática via Mercado Pago — não é necessário clicar em &quot;Já paguei&quot;.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPixOpen(false)}
                className="rounded-lg p-1 text-[#6b7280] hover:bg-[#f3f4f6]"
                aria-label="Fechar"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {billing.amountLabel ? (
              <p className="mt-4 text-center text-2xl font-bold text-[#1a1614]">{billing.amountLabel}</p>
            ) : null}

            {billing.pixQrBase64 ? (
              <img
                src={`data:image/png;base64,${billing.pixQrBase64}`}
                alt="QR Code PIX"
                className="mx-auto mt-4 h-48 w-48 rounded-xl border border-[var(--card-border)]"
              />
            ) : (
              <p className="mt-6 text-center text-sm text-amber-800">
                Gerando QR… Se não aparecer em instantes, recarrega a página.
              </p>
            )}

            {billing.pixCopyPaste ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-[#6b7280]">Copia e cola</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={billing.pixCopyPaste}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--card-border)] bg-[#f9fafb] px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void copyPix()}
                    className="shrink-0 rounded-xl bg-[var(--dash-primary)] px-3 py-2 text-xs font-semibold text-white"
                  >
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            ) : null}

            <p className="mt-4 text-center text-xs text-[#6b7280]">
              Aguardando confirmação do pagamento…
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function subscriptionBannerDismissStorageNote(): string {
  return 'sessionStorage até meia-noite local'
}
