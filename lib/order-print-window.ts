'use client'

import type { StoreOrderRow } from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'

const moneyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function paymentMethodLabel(pm: string | null | undefined): string {
  const t = String(pm ?? '').trim().toLowerCase()
  if (t === 'cash') return 'Dinheiro'
  if (t === 'pix') return 'PIX'
  if (t === 'card') return 'Cartão'
  if (t === 'credit' || t === 'credito' || t === 'crédito') return 'Crédito'
  const raw = String(pm ?? '').trim()
  return raw || '—'
}

function sourceLabel(src: string | null | undefined): string {
  const t = String(src ?? '').trim().toLowerCase()
  if (t === 'waiter') return 'Garçom'
  if (t === 'pdv') return 'Balcão'
  if (t === 'menu_link' || t === '') return 'Cardápio online'
  return t || '—'
}

function parseNum(v: number | string | null | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/**
 * Abre janela térmica com cupom do pedido e dispara impressão (para «Impressão automática»).
 * Retorna false se pop-up bloqueado.
 */
export function openOrderTicketPrint(opts: {
  storeName: string
  order: StoreOrderRow
  /** Ex.: "042" para mostrar PEDIDO #042 */
  orderDisplayRef: string
  printing: Pick<
    StorePrintingState,
    'print_include_customer_details' | 'print_delivery_copy'
  >
}): boolean {
  if (typeof window === 'undefined') return false

  const win = window.open('', '_blank', 'width=380,height=720')
  if (!win) return false

  const header = esc(opts.storeName.trim().toUpperCase() || 'LOJA')
  const ref = esc(opts.orderDisplayRef.trim() || '—')
  const itemsRaw = opts.order.items_summary?.trim() || '—'
  const itemsHtml = esc(itemsRaw).replace(/\n/g, '<br/>')

  const total = parseNum(opts.order.total)
  const fee = parseNum(opts.order.delivery_fee)
  const subtotal = fee > 0 ? Math.max(0, total - fee) : total

  const customerBlock =
    opts.printing.print_include_customer_details
      ? `<div class="line"></div><p><strong>Cliente</strong><br/>${esc(
          opts.order.customer_name?.trim() || '—'
        )}<br/>Tel: ${esc(
          opts.order.customer_phone?.trim() || '—'
        )}<br/>${opts.order.delivery_address?.trim()
          ? `End.: ${esc(opts.order.delivery_address.trim())}<br/>`
          : ''
        }Pagamento: ${esc(paymentMethodLabel(opts.order.payment_method))}</p>`
      : ''

  const deliveryCopyBlock = opts.printing.print_delivery_copy
    ? `<div class="line"></div><p style="text-align:center;font-weight:bold">2ª via — entregador</p>`
    : ''

  const notesBlock = opts.order.notes?.trim()
    ? `<p style="margin-top:8px;font-size:11px"><strong>Obs.:</strong> ${esc(
        opts.order.notes.trim()
      )}</p>`
    : ''

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Pedido #${ref}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    height: auto !important;
    min-height: 0 !important;
    overflow: hidden !important;
  }
  body {
    font-family: ui-monospace, system-ui, monospace;
    font-size: 12px;
    padding: 12px;
    color: #111;
    width: 72mm;
    max-width: 100%;
  }
  @media print {
    html, body { overflow: visible !important; }
    body { padding: 8px; }
  }
  h1 { font-size: 13px; text-align: center; margin: 0 0 8px; }
  .line { border-top: 1px dashed #999; margin: 8px 0; }
  .meta { font-size: 11px; color: #444; margin-bottom: 8px; }
</style></head><body>
<h1>${header}</h1>
<p class="meta">${esc(sourceLabel(opts.order.source))} · ${esc(
    new Date(opts.order.created_at).toLocaleString('pt-BR')
  )}</p>
<p><strong>PEDIDO #${ref}</strong></p>
<p style="white-space:pre-wrap;word-break:break-word">${itemsHtml}</p>
${notesBlock}
<div class="line"></div>
<p>Subtotal: ${moneyFmt.format(subtotal)}</p>
${fee > 0 ? `<p>Taxa entrega: ${moneyFmt.format(fee)}</p>` : ''}
<p><strong>TOTAL: ${moneyFmt.format(total)}</strong></p>
${customerBlock}
${deliveryCopyBlock}
</body></html>`

  win.document.open()
  win.document.write(html)
  win.document.close()

  const runPrint = () => {
    try {
      win.focus()
      win.print()
    } catch {
      /* ignore */
    }
  }

  const closeAfterPrint = () => {
    try {
      win.removeEventListener('afterprint', closeAfterPrint)
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      try {
        if (!win.closed) win.close()
      } catch {
        /* ignore */
      }
    }, 150)
  }

  try {
    win.addEventListener('afterprint', closeAfterPrint)
  } catch {
    /* ignore */
  }

  window.setTimeout(runPrint, 120)
  return true
}
