'use client'

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/** Tamanho em px do PNG (bom para imprimir no balcão / flyers). */
const QR_EXPORT_PX = 512

function safeDownloadBasename(slug: string): string {
  const s = slug.trim().replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-')
  return (s || 'loja').slice(0, 80)
}

/** Mesmo slug: URL sem `auto` → entrega/retirada; com `?auto=1` → checkout na mesa (Garçom). */
export type StorePublicQrCheckoutMode = 'delivery_pickup' | 'dine_in'

export function StorePublicQrPanel({
  publicUrl,
  storeSlug,
  compact = false,
  showSlugUniquenessNote = true,
  /** Qual fluxo de checkout este QR abre (o URL codificado no QR muda). */
  qrCheckoutMode = 'delivery_pickup',
  /** Sem título nem parágrafos explicativos — só QR e botão (ex.: Garçom). */
  hideExplanatoryCopy = false,
}: {
  publicUrl: string | null
  storeSlug: string | null
  /** Menos texto — útil na secção de Configurações. */
  compact?: boolean
  /** Nota de que o URL (slug) é único por loja na Vyria. */
  showSlugUniquenessNote?: boolean
  qrCheckoutMode?: StorePublicQrCheckoutMode
  hideExplanatoryCopy?: boolean
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!publicUrl) {
      void Promise.resolve().then(() => {
        if (cancelled) return
        setDataUrl(null)
        setError(null)
      })
      return () => {
        cancelled = true
      }
    }

    void Promise.resolve().then(() => {
      if (cancelled) return
      setError(null)
    })

    void QRCode.toDataURL(publicUrl, {
      width: QR_EXPORT_PX,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111827', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl(null)
          setError('Não foi possível gerar o QR Code.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [publicUrl])

  if (!publicUrl || !storeSlug) return null

  const isDineIn = qrCheckoutMode === 'dine_in'
  const titleCompact = isDineIn ? 'QR — pedido na mesa' : 'QR — entrega e retirada'
  const titleFull = isDineIn ? 'QR Code (pedido na mesa / comanda)' : 'QR Code (entrega e retirada)'
  const imgAlt = isDineIn
    ? 'QR Code do cardápio com pedido na mesa'
    : 'QR Code do cardápio com entrega e retirada'

  function downloadPng() {
    if (!dataUrl || !storeSlug) return
    const a = document.createElement('a')
    a.href = dataUrl
    const prefix = isDineIn ? 'vyria-mesa' : 'vyria-cardapio'
    a.download = `${prefix}-${safeDownloadBasename(storeSlug)}.png`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div
      className={
        compact
          ? 'mt-4 rounded-xl border border-[var(--card-border)] bg-white p-4'
          : 'border-t border-[var(--card-border)] pt-4'
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex shrink-0 justify-center sm:justify-start">
          <div className="rounded-2xl border border-[var(--card-border)] bg-white p-3 shadow-sm">
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL gerada em runtime
              <img
                src={dataUrl}
                alt={imgAlt}
                width={QR_EXPORT_PX}
                height={QR_EXPORT_PX}
                className="h-auto w-[200px] sm:w-[240px]"
              />
            ) : error ? (
              <div
                className="flex size-[200px] items-center justify-center bg-[#f9fafb] text-center text-xs text-red-700 sm:size-[240px]"
                role="alert"
              >
                {error}
              </div>
            ) : (
              <div
                className="flex size-[200px] animate-pulse items-center justify-center bg-[#f3f4f6] text-xs text-[#9ca3af] sm:size-[240px]"
                aria-hidden
              >
                A gerar…
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {!hideExplanatoryCopy ? (
            <>
              {!compact ? (
                <p className="text-sm font-semibold text-[#1a1614]">{titleFull}</p>
              ) : (
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                  {titleCompact}
                </p>
              )}
              <p className="text-xs leading-relaxed text-[#6b7280]">
                {isDineIn
                  ? compact
                    ? 'URL com ?auto=1: checkout na mesa/comanda. Um QR para todas as mesas (cliente indica a mesa ao finalizar).'
                    : 'Este código abre o teu cardápio já no fluxo de pedido na mesa (URL com ?auto=1). Todas as mesas partilham o mesmo QR; o cliente indica a mesa no checkout.'
                  : compact
                    ? 'Abre o slug sem modo mesa: checkout de entrega e retirada. O QR de mesa/comanda é outro (Garçom, com ?auto=1).'
                    : 'Este código abre o cardápio com finalização por entrega e retirada (URL sem modo mesa). Para o salão, usa o QR da página Garçom — é outro link, com pedido na mesa/comanda.'}{' '}
                <span className="text-[#9ca3af]">
                  O PNG é gerado em alta resolução ({QR_EXPORT_PX}×{QR_EXPORT_PX}px).
                </span>
              </p>
              {showSlugUniquenessNote ? (
                <p className="text-[11px] leading-relaxed text-[#6b7280]">
                  {compact
                    ? isDineIn
                      ? 'São dois QRs por loja (entrega/retirada vs mesa); entre contas, o slug não se repete — nenhum QR coincide com o de outro lojista.'
                      : 'São dois QRs por loja (este e o de mesa no Garçom); entre contas, o slug é único — o QR não coincide com o de outro lojista.'
                    : isDineIn
                      ? 'O QR codifica o URL completo (inclui ?auto=1), por isso é diferente do QR das Configurações. Na Vyria, cada slug de loja é único entre contas; conflitos ao gravar são resolvidos automaticamente. Para a base de dados em concorrência, aplica `scripts/supabase-stores-slug-unique.sql` no Supabase.'
                      : 'O QR codifica o URL exacto (sem modo mesa). Na Vyria, cada slug é único entre contas; o QR de mesa (Garçom) é outro URL no mesmo slug. Para garantir unicidade na base de dados, aplica `scripts/supabase-stores-slug-unique.sql` no Supabase.'}
                </p>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            onClick={downloadPng}
            disabled={!dataUrl}
            className="inline-flex items-center justify-center rounded-lg border border-[var(--card-border)] bg-[#fafafa] px-4 py-2.5 text-sm font-semibold text-[#1a1614] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Baixar PNG ({QR_EXPORT_PX}px)
          </button>
        </div>
      </div>
    </div>
  )
}
