import type { StorePrintingState } from '@/lib/store-printing'

const moneyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/**
 * Abre uma janela só com o cupom de teste, com barra para voltar ao painel ou fechar.
 * Evita ficar preso após o diálogo de impressão (sobretudo em mobile).
 */
export function openPrintingPreviewPopup(opts: {
  storeName: string
  fee: number
  values: Pick<
    StorePrintingState,
    | 'print_include_customer_details'
    | 'print_delivery_copy'
    | 'print_paper_mm'
  >
  /** Caminho absoluto no site (ex.: /dashboard/printing) para o link «Voltar ao painel». */
  returnPath?: string
}): boolean {
  if (typeof window === 'undefined') return false

  const returnPath = opts.returnPath ?? '/dashboard/printing'
  const returnUrl = `${window.location.origin}${returnPath.startsWith('/') ? returnPath : `/${returnPath}`}`

  const subtotal = 63.8
  const total = subtotal + opts.fee
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const header = esc(opts.storeName.trim().toUpperCase() || 'A TUA LOJA')

  const paper = opts.values.print_paper_mm === 58 ? 58 : 80
  const bodyMax = paper === 58 ? '200px' : '280px'

  const w = window.open('', 'vyria_print_preview', 'width=380,height=720')
  if (!w) return false

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Cupom — pré-visualização</title>
<style>
  *{box-sizing:border-box}
  body{font-family:ui-monospace,system-ui,monospace;font-size:12px;margin:0;padding:0;color:#111;background:#f3f4f6}
  .noprint{background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;position:sticky;top:0;z-index:10;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .noprint-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center}
  .btn{border:1px solid #d1d5db;background:#fff;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;cursor:pointer;color:#111}
  .btn-primary{background:var(--vyria-primary,#c2410c);border-color:transparent;color:#fff}
  .link{color:#1d4ed8;text-decoration:underline;font-size:13px;font-weight:600}
  .body{padding:12px;max-width:${bodyMax};margin:0 auto}
  h1{font-size:13px;text-align:center;margin:0 0 8px}
  .line{border-top:1px dashed #999;margin:8px 0}
  @page{size:80mm auto;margin:4mm}
  html,body{height:auto!important;min-height:0!important}
  @media print{
    .noprint{display:none!important}
    body{background:#fff}
    html,body{overflow:visible!important}
  }
</style></head><body>
<div class="noprint">
  <div class="noprint-row">
    <button type="button" class="btn btn-primary" onclick="try{if(window.opener){window.opener.focus();}}catch(e){} window.close();">Voltar ao painel</button>
    <a class="link" href="${esc(returnUrl)}">Abrir configuração nesta janela</a>
  </div>
  <div class="noprint-row" style="margin-top:8px">
    <button type="button" class="btn" onclick="window.print()">Imprimir cupom</button>
  </div>
</div>
<div class="body">
<h1>${header}</h1>
<p><strong>PEDIDO #001</strong></p>
<p>2x Smash Burger Clássico<br/>1x Coca Cola 350ml</p>
<div class="line"></div>
<p>Subtotal: ${moneyFmt.format(subtotal)}</p>
<p>Taxa entrega: ${moneyFmt.format(opts.fee)}</p>
<p><strong>TOTAL: ${moneyFmt.format(total)}</strong></p>
${
  opts.values.print_include_customer_details
    ? `<div class="line"></div><p>Cliente: João Silva<br/>Tel: (11) 98765-4321<br/>Rua das Acácias, 456<br/>Pagamento: PIX</p>`
    : ''
}
${
  opts.values.print_delivery_copy
    ? `<div class="line"></div><p style="text-align:center;font-weight:bold">2ª via — entregador</p>`
    : ''
}
</div>
</body></html>`

  w.document.write(html)
  w.document.close()
  try {
    w.focus()
  } catch {
    /* ignore */
  }
  return true
}
