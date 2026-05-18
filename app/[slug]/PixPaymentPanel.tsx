'use client'

import { useCallback, useEffect, useState } from 'react'

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
  onNotifyStore,
  onClose,
}: {
  amount: number
  receiverName: string
  orderRef: string
  copyPaste: string
  qrCodeDataUrl: string
  storeSlug: string
  orderId: string
  onNotifyStore: () => void
  onClose: () => void
}) {
  const [secondsLeft, setSecondsLeft] = useState(PIX_TIMER_SECONDS)
  const [copied, setCopied] = useState(false)
  const [ackBusy, setAckBusy] = useState(false)
  const [ackError, setAckError] = useState<string | null>(null)

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

  async function handlePaid() {
    setAckError(null)
    setAckBusy(true)
    try {
      const resp = await fetch('/api/public/orders/pix-ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: storeSlug, orderId }),
      })
      const data = (await resp.json()) as { ok?: boolean; error?: string }
      if (!resp.ok || !data.ok) {
        setAckError(data.error || 'Não foi possível registar o pagamento.')
        setAckBusy(false)
        return
      }
      onNotifyStore()
    } catch (e) {
      setAckError(e instanceof Error ? e.message : 'Erro de rede.')
      setAckBusy(false)
    }
  }

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
        loja. Após o pagamento envie o comprovante no WhatsApp.
      </p>

      {ackError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {ackError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => void handlePaid()}
          disabled={ackBusy}
          className="flex-1 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#20bd5a] disabled:opacity-60"
        >
          {ackBusy ? 'A registar…' : 'Já paguei'}
        </button>
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
