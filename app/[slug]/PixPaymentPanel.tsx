'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const PIX_TIMER_SECONDS = 15 * 60

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function PixPaymentPanel({
  amount,
  receiverName,
  orderRef,
  copyPaste,
  qrCodeDataUrl,
  storeSlug,
  orderId,
  onConfirmed,
  onClose,
}: {
  amount: number
  receiverName: string
  orderRef: string
  copyPaste: string
  qrCodeDataUrl: string
  storeSlug: string
  orderId: string
  onConfirmed: () => void
  onClose: () => void
}) {
  const [secondsLeft, setSecondsLeft] = useState(PIX_TIMER_SECONDS)
  const [copied, setCopied] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const confirmedRef = useRef(false)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const t = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [secondsLeft])

  const copyPix = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(copyPaste)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copia o código PIX:', copyPaste)
    }
  }, [copyPaste])

  const checkPaymentStatus = useCallback(async () => {
    if (confirmedRef.current) return
    try {
      const params = new URLSearchParams({ slug: storeSlug, orderId })
      const resp = await fetch(`/api/public/orders/pix-status?${params.toString()}`, {
        cache: 'no-store',
      })
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean
        confirmed?: boolean
        error?: string
      }
      if (!resp.ok || !data.ok) {
        setStatusError(data.error || 'Não foi possível verificar o pagamento.')
        return
      }
      setStatusError(null)
      if (data.confirmed) {
        confirmedRef.current = true
        onConfirmed()
      }
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'Erro de rede.')
    }
  }, [onConfirmed, orderId, storeSlug])

  useEffect(() => {
    const first = window.setTimeout(() => {
      void checkPaymentStatus()
    }, 0)
    const t = window.setInterval(() => {
      void checkPaymentStatus()
    }, 5000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(t)
    }
  }, [checkPaymentStatus])

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white p-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900/70">
          Pagar com PIX
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-vyria-navy">
          {money.format(amount)}
        </p>
        <p className="mt-1 text-xs text-vyria-navy-muted">
          Para <span className="font-semibold text-vyria-navy">{receiverName}</span>
        </p>
        <p className="mt-2 text-[11px] text-vyria-navy-muted">
          Pedido {orderRef}
          {secondsLeft > 0 ? (
            <>
              {' '}
              · expira em{' '}
              <span className="font-mono font-semibold text-amber-800">
                {formatCountdown(secondsLeft)}
              </span>
            </>
          ) : (
            <span className="text-amber-800"> · prazo expirado (podes ainda pagar)</span>
          )}
        </p>
      </div>

      <div className="flex justify-center rounded-2xl border border-[var(--card-border)] bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrCodeDataUrl}
          alt="QR Code PIX"
          width={280}
          height={280}
          className="h-auto max-w-full rounded-lg"
        />
      </div>

      <div className="rounded-xl border border-[var(--card-border)] bg-[#f8fafc] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-vyria-navy-muted">
          PIX copia e cola
        </p>
        <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-vyria-navy">
          {copyPaste.length > 120 ? `${copyPaste.slice(0, 120)}…` : copyPaste}
        </p>
        <button
          type="button"
          onClick={() => void copyPix()}
          className="mt-3 w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-100"
        >
          {copied ? 'Código copiado!' : 'Copiar código PIX'}
        </button>
      </div>

      <p className="text-center text-xs leading-relaxed text-vyria-navy-muted">
        O pagamento vai <strong className="text-vyria-navy">directamente</strong> para a conta da
        loja. O pedido só entra no painel quando o pagamento for confirmado automaticamente.
      </p>

      {statusError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {statusError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-950">
          Aguardando confirmação automática do PIX…
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm font-semibold text-vyria-navy-muted hover:bg-[#f8fafc]"
        >
          Fechar
        </button>
      </div>
    </div>
  )
}
