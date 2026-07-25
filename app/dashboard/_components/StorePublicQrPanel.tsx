'use client'

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/** Pôster print-ready (proporção ~A5 retrato). */
const POSTER_W = 1080
const POSTER_H = 1530
/** QR gerado em alta resolução para ficar nítido na impressão. */
const QR_SRC_PX = 1024

const BRAND = {
  navy: '#1d2d44',
  plum: '#801b4d',
  orange: '#f27121',
  gold: '#fbb03b',
  muted: '#5b6b7f',
  faint: '#9aa6b2',
  border: '#e8eaef',
}

function safeDownloadBasename(slug: string): string {
  const s = slug.trim().replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-')
  return (s || 'loja').slice(0, 80)
}

/** Mesmo slug: URL sem `auto` → entrega/retirada; com `?auto=1` → checkout na mesa (Garçom). */
export type StorePublicQrCheckoutMode = 'delivery_pickup' | 'dine_in'

type PosterCopy = {
  eyebrow: string
  title: string
  subtitle: string
  steps: string
}

function posterCopy(isDineIn: boolean): PosterCopy {
  return isDineIn
    ? {
        eyebrow: 'AUTOATENDIMENTO',
        title: 'Peça pela mesa',
        subtitle: 'Monte seu pedido pelo celular, sem esperar pelo garçom.',
        steps: 'Aponte a câmera do celular para o QR Code',
      }
    : {
        eyebrow: 'CARDÁPIO DIGITAL',
        title: 'Faça seu pedido',
        subtitle: 'Veja o cardápio completo e peça pelo seu celular.',
        steps: 'Aponte a câmera do celular para o QR Code',
      }
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrapCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(/\s+/)
  let line = ''
  let y = startY
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, centerX, y)
      line = word
      y += lineHeight
    } else {
      line = test
    }
  }
  if (line) {
    ctx.fillText(line, centerX, y)
    y += lineHeight
  }
  return y
}

function cleanUrlForDisplay(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob falhou'))),
      'image/png'
    )
  })
}

async function buildBrandedPoster(
  publicUrl: string,
  isDineIn: boolean
): Promise<Blob> {
  const qrSrc = await QRCode.toDataURL(publicUrl, {
    width: QR_SRC_PX,
    margin: 1,
    errorCorrectionLevel: 'Q',
    color: { dark: BRAND.navy, light: '#ffffff' },
  })

  const qrImg = new Image()
  qrImg.src = qrSrc
  await qrImg.decode()

  const canvas = document.createElement('canvas')
  canvas.width = POSTER_W
  canvas.height = POSTER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas indisponível')

  const copy = posterCopy(isDineIn)

  // Fundo
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, POSTER_W, POSTER_H)

  // Moldura com gradiente da marca
  const inset = 44
  const grad = ctx.createLinearGradient(inset, 0, POSTER_W - inset, 0)
  grad.addColorStop(0, BRAND.plum)
  grad.addColorStop(0.55, BRAND.orange)
  grad.addColorStop(1, BRAND.gold)
  ctx.lineWidth = 14
  ctx.strokeStyle = grad
  roundRectPath(ctx, inset, inset, POSTER_W - inset * 2, POSTER_H - inset * 2, 60)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Eyebrow
  ctx.fillStyle = BRAND.orange
  ctx.font = '700 30px Helvetica, Arial, sans-serif'
  ctx.letterSpacing = '10px'
  ctx.fillText(copy.eyebrow, POSTER_W / 2 + 5, 190)
  ctx.letterSpacing = '0px'

  // Título
  ctx.fillStyle = BRAND.navy
  ctx.font = '800 82px Helvetica, Arial, sans-serif'
  ctx.fillText(copy.title, POSTER_W / 2, 290)

  // Subtítulo
  ctx.fillStyle = BRAND.muted
  ctx.font = '400 34px Helvetica, Arial, sans-serif'
  wrapCenteredText(ctx, copy.subtitle, POSTER_W / 2, 350, POSTER_W - 280, 46)

  // Cartão do QR
  const qrBox = 620
  const qx = (POSTER_W - qrBox) / 2
  const qy = 430
  ctx.save()
  ctx.shadowColor = 'rgba(20,32,50,0.14)'
  ctx.shadowBlur = 44
  ctx.shadowOffsetY = 18
  ctx.fillStyle = '#ffffff'
  roundRectPath(ctx, qx, qy, qrBox, qrBox, 44)
  ctx.fill()
  ctx.restore()
  ctx.lineWidth = 2
  ctx.strokeStyle = BRAND.border
  roundRectPath(ctx, qx, qy, qrBox, qrBox, 44)
  ctx.stroke()
  const pad = 54
  ctx.drawImage(qrImg, qx + pad, qy + pad, qrBox - pad * 2, qrBox - pad * 2)

  // Instrução abaixo do QR
  const afterQr = qy + qrBox
  ctx.fillStyle = BRAND.navy
  ctx.font = '700 38px Helvetica, Arial, sans-serif'
  wrapCenteredText(ctx, copy.steps, POSTER_W / 2, afterQr + 92, POSTER_W - 220, 50)

  // URL (fallback de leitura)
  ctx.fillStyle = BRAND.faint
  ctx.font = '500 28px Helvetica, Arial, sans-serif'
  ctx.fillText(cleanUrlForDisplay(publicUrl), POSTER_W / 2, afterQr + 150)

  // Rodapé / wordmark
  ctx.fillStyle = BRAND.navy
  ctx.font = '800 48px Helvetica, Arial, sans-serif'
  ctx.letterSpacing = '2px'
  ctx.fillText('vyria', POSTER_W / 2, POSTER_H - 96)
  ctx.letterSpacing = '0px'
  ctx.fillStyle = BRAND.faint
  ctx.font = '500 24px Helvetica, Arial, sans-serif'
  ctx.fillText('cardápio & pedidos digitais', POSTER_W / 2, POSTER_H - 58)

  return canvasToBlob(canvas)
}

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
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isDineIn = qrCheckoutMode === 'dine_in'

  useEffect(() => {
    if (!publicUrl) return

    let cancelled = false
    let objectUrl: string | null = null

    void buildBrandedPoster(publicUrl, isDineIn)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setPosterUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) {
          setPosterUrl(null)
          setError('Não foi possível gerar o QR Code.')
        }
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [publicUrl, isDineIn])

  if (!publicUrl || !storeSlug) return null

  const titleCompact = isDineIn ? 'QR — pedido na mesa' : 'QR — entrega e retirada'
  const titleFull = isDineIn ? 'QR Code (pedido na mesa / comanda)' : 'QR Code (entrega e retirada)'
  const imgAlt = isDineIn
    ? 'Cartaz de autoatendimento com QR Code para pedido na mesa'
    : 'Cartaz com QR Code do cardápio para entrega e retirada'

  function downloadPng() {
    if (!posterUrl || !storeSlug) return
    const prefix = isDineIn ? 'vyria-autoatendimento' : 'vyria-cardapio'
    const filename = `${prefix}-${safeDownloadBasename(storeSlug)}.png`
    const a = document.createElement('a')
    // Em navegadores in-app (Instagram, etc.) o atributo download costuma ser
    // ignorado; abrir noutra aba deixa o utilizador guardar a imagem manualmente.
    // Verifica no prototype para não estreitar o tipo de `a` (TS).
    const supportsDownload = 'download' in HTMLAnchorElement.prototype
    a.href = posterUrl
    a.download = filename
    a.rel = 'noopener'
    if (!supportsDownload) a.target = '_blank'
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
          <div className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white shadow-sm">
            {posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL gerada em runtime
              <img
                src={posterUrl}
                alt={imgAlt}
                width={POSTER_W}
                height={POSTER_H}
                className="block h-auto w-[210px] sm:w-[248px]"
              />
            ) : error ? (
              <div
                className="flex h-[298px] w-[210px] items-center justify-center bg-[#f9fafb] text-center text-xs text-red-700 sm:h-[351px] sm:w-[248px]"
                role="alert"
              >
                {error}
              </div>
            ) : (
              <div
                className="flex h-[298px] w-[210px] animate-pulse items-center justify-center bg-[#f3f4f6] text-xs text-[#9ca3af] sm:h-[351px] sm:w-[248px]"
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
                  O PNG sai pronto para impressão ({POSTER_W}×{POSTER_H}px, proporção A5) com moldura e identidade Vyria.
                </span>
              </p>
              {showSlugUniquenessNote ? (
                <p className="text-[11px] leading-relaxed text-[#6b7280]">
                  {compact
                    ? isDineIn
                      ? 'São dois QRs por loja (entrega/retirada vs mesa); entre contas, o slug não se repete — nenhum QR coincide com o de outro lojista.'
                      : 'São dois QRs por loja (este e o de mesa no Garçom); entre contas, o slug é único — o QR não coincide com o de outro lojista.'
                    : isDineIn
                      ? 'O QR codifica o URL completo (inclui ?auto=1), por isso é diferente do QR das Configurações. Na Vyria, cada slug de loja é único entre contas; conflitos ao gravar são resolvidos automaticamente.'
                      : 'O QR codifica o URL exacto (sem modo mesa). Na Vyria, cada slug é único entre contas; o QR de mesa (Garçom) é outro URL no mesmo slug.'}
                </p>
              ) : null}
            </>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadPng}
              disabled={!posterUrl}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] bg-[#fafafa] px-4 py-2.5 text-sm font-semibold text-[#1a1614] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
              </svg>
              Baixar cartaz (PNG)
            </button>
            {posterUrl ? (
              <a
                href={posterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-[var(--dash-primary)] underline-offset-2 hover:underline"
              >
                Abrir imagem
              </a>
            ) : null}
          </div>
          <p className="text-[11px] leading-relaxed text-[#9ca3af]">
            Se estiver a abrir dentro do Instagram/Facebook, toca em «Abrir imagem» e guarda com um toque longo, ou abre este link no Chrome/Safari.
          </p>
        </div>
      </div>
    </div>
  )
}
