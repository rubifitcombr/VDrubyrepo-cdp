'use client'

import { uint8ToBase64 } from '@/lib/print/escpos'
import { DEFAULT_PAPER_MM, type PaperMm } from '@/lib/print/layout'
import { logPrintJob } from '@/lib/print/logger'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Payload ESC/POS em sessionStorage — não embutir base64 enorme no HTML (mobile/Bluetooth). */
const ESC_POS_JOB_KEY_PREFIX = 'vyria-esc-pos-job:'
const ASCII_PREVIEW_HTML_MAX = 28_000

type EscPosHtmlPayload =
  | { kind: 'storageKey'; storageKey: string }
  | { kind: 'inlineB64'; b64: string }
  | { kind: 'downloadOnly' }

function prepareEscPosHtmlPayload(
  b64: string,
  filename: string,
  baud: number
): EscPosHtmlPayload {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  const storageKey = ESC_POS_JOB_KEY_PREFIX + id
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ b64, filename, baud }))
    return { kind: 'storageKey', storageKey }
  } catch {
    /* quota, modo privado */
  }
  if (b64.length <= 14_000) {
    return { kind: 'inlineB64', b64 }
  }
  return { kind: 'downloadOnly' }
}

export type ThermalEscPosWindowOpts = {
  documentTitle: string
  safeFilenameStem: string
  asciiPreview: string
  escPosBytes: Uint8Array
  serialBaud: number
  logOrderId?: string
  /** Largura do rolo (58/80 mm) — define @page para impressão pelo sistema no mobile. */
  paperMm?: PaperMm
}

export type ThermalOpenResult = 'opened' | 'failed'

const THERMAL_HOST_IFRAME_ID = 'vyria-thermal-print-host'

function isAppleMobileOrTabletUa(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPod|iPad/i.test(ua)) return true
  if (/\biPad\b/i.test(ua)) return true
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}

function armThermalIframeCleanup(iframe: HTMLIFrameElement, childWin: Window): void {
  const cleanup = () => {
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
  }
  try {
    childWin.addEventListener('afterprint', () => window.setTimeout(cleanup, 320))
  } catch {
    /* ignore */
  }
  window.setTimeout(cleanup, 45_000)
}

/** Telemóvel / tablet: impressão automática fora de gesto — pop-up é bloqueado; iframe na mesma página evita isso. */
export function isMobileThermalHost(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPod|Android.*Mobile|IEMobile|Opera Mini/i.test(ua)) return true
  if (/\biPad\b/i.test(ua)) return true
  if (
    typeof navigator !== 'undefined' &&
    /Macintosh/.test(ua) &&
    navigator.maxTouchPoints > 1
  ) {
    return true
  }
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 768px)').matches
  ) {
    return true
  }
  return /Android|webOS|BlackBerry|Mobile/i.test(ua)
}

function stripIllFormedPreviewChars(s: string): string {
  return s.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

/**
 * Android/iOS costumam falhar com documentos de impressão muito altos no WebView.
 * No modo embedded limitamos só a pré-visualização ASCII; o .prn / ESC/POS mantém-se completo.
 * Mantém sempre o bloco final (Subtotal / taxa / TOTAL / pagamento) visível.
 */
function clampAsciiPreviewForEmbeddedHost(raw: string): string {
  const MAX_BODY_LINES = 420
  const MAX_BODY_CHARS = 14_000

  let footIdx = raw.lastIndexOf('\nSubtotal')
  if (footIdx < 0) footIdx = raw.lastIndexOf('\nTOTAL')
  const footer = footIdx >= 0 ? raw.slice(footIdx + 1).trimEnd() : ''
  const body = footIdx >= 0 ? raw.slice(0, footIdx + 1) : raw

  let b = body
  const lines = b.split('\n')
  if (lines.length > MAX_BODY_LINES) {
    b =
      lines.slice(0, MAX_BODY_LINES).join('\n') +
      '\n[... itens cortados — use «Baixar .prn» p/ lista completa.]'
  }
  if (b.length > MAX_BODY_CHARS) {
    const slice = b.slice(0, MAX_BODY_CHARS)
    const cut = slice.lastIndexOf('\n')
    b =
      (cut > 4000 ? slice.slice(0, cut) : slice) +
      '\n[... texto cortado — use «Baixar .prn» p/ cupom completo.]'
  }
  const head = b.trimEnd()
  return footer ? `${head}\n\n${footer}` : head
}

/**
 * Abre o HTML do cupom num iframe same-origin (sem `window.open`) e deixa o script interno
 * disparar `print()` — contorna bloqueio de pop-up na automação iOS/Android.
 * Safari/iPhone: `document.write` por vezes falha; usa `src` com blob URL como fallback.
 */
function writeThermalToHiddenIframe(html: string): boolean {
  const mountIframe = (): HTMLIFrameElement => {
    const prev = document.getElementById(THERMAL_HOST_IFRAME_ID)
    if (prev) prev.remove()
    const iframe = document.createElement('iframe')
    iframe.id = THERMAL_HOST_IFRAME_ID
    iframe.setAttribute('aria-hidden', 'true')
    iframe.title = 'Vyria — impressão'
    iframe.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;margin:0;border:0;opacity:0.02;pointer-events:none;z-index:2147483646;clip-path:inset(50%)'
    document.body.appendChild(iframe)
    return iframe
  }

  const tryDocumentWrite = (): boolean => {
    try {
      const iframe = mountIframe()
      const w = iframe.contentWindow
      if (!w) {
        iframe.remove()
        return false
      }
      w.document.open()
      w.document.write(html)
      w.document.close()
      armThermalIframeCleanup(iframe, w)
      return true
    } catch {
      return false
    }
  }

  const tryBlobSrc = (): boolean => {
    let url: string | null = null
    try {
      const iframe = mountIframe()
      const w = iframe.contentWindow
      if (!w) {
        iframe.remove()
        return false
      }
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      url = URL.createObjectURL(blob)
      iframe.addEventListener(
        'load',
        () => {
          try {
            URL.revokeObjectURL(url!)
          } catch {
            /* ignore */
          }
          try {
            armThermalIframeCleanup(iframe, w)
          } catch {
            /* ignore */
          }
        },
        { once: true }
      )
      iframe.src = url
      return true
    } catch {
      if (url) {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* ignore */
        }
      }
      return false
    }
  }

  if (isAppleMobileOrTabletUa()) {
    if (tryBlobSrc()) return true
    return tryDocumentWrite()
  }
  if (tryDocumentWrite()) return true
  if (isMobileThermalHost()) {
    return tryBlobSrc()
  }
  return false
}

function buildThermalTicketHtml(opts: {
  documentTitle: string
  filename: string
  baud: number
  asciiPreview: string
  payload: EscPosHtmlPayload
  /** `embedded` = iframe na mesma página: permite impressão automática no telemóvel. */
  thermalHost: 'popup' | 'embedded'
  paperMm: PaperMm
}): string {
  const storageKeyJson =
    opts.payload.kind === 'storageKey'
      ? JSON.stringify(opts.payload.storageKey)
      : 'null'
  const inlineB64Json =
    opts.payload.kind === 'inlineB64' ? JSON.stringify(opts.payload.b64) : 'null'

  const loadB64Block =
    opts.payload.kind === 'storageKey'
      ? `
  var sk = ${storageKeyJson};
  var raw = null;
  try { raw = rootWin.sessionStorage.getItem(sk); } catch (e1) {}
  try { if (sk) rootWin.sessionStorage.removeItem(sk); } catch (e2) {}
  if (!raw) {
    var h = document.querySelector('.hint');
    if (h) h.textContent = 'Não foi possível carregar o cupom. Fecha e tenta «Baixar .prn» no painel.';
    return;
  }
  var data;
  try {
    data = JSON.parse(raw);
  } catch (e3) {
    var h2 = document.querySelector('.hint');
    if (h2) h2.textContent = 'Dados inválidos. Fecha e gera o cupom outra vez.';
    return;
  }
  var b64 = data.b64;
  var filename = data.filename || ${JSON.stringify(opts.filename)};
  var baud = data.baud != null ? data.baud : ${JSON.stringify(opts.baud)};`
      : `
  var b64 = ${inlineB64Json};
  var filename = ${JSON.stringify(opts.filename)};
  var baud = ${JSON.stringify(opts.baud)};`

  const script = `
(function(){
  var rootWin = window;
  try { if (window.parent && window.parent !== window) rootWin = window.parent; } catch (e0) {}
${loadB64Block}
  function binAtob(b) {
    var bin = atob(b);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i) & 255;
    return buf;
  }
  function download() {
    var buf = binAtob(b64);
    var blob = new Blob([buf], { type: 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }
  async function serial() {
    if (!navigator.serial) {
      alert('Web Serial disponível no Chrome/Edge, em HTTPS ou localhost.');
      return;
    }
    try {
      var port = await navigator.serial.requestPort({ filters: [] });
      await port.open({ baudRate: baud });
      var w = port.writable.getWriter();
      await w.write(binAtob(b64));
      await w.close();
      await port.close();
    } catch (e) {
      alert(e && e.message ? e.message : String(e));
    }
  }
  var dl = document.getElementById('dl');
  var se = document.getElementById('se');
  var pr = document.getElementById('pr');
  if (dl) dl.onclick = download;
  if (se) se.onclick = function() { void serial(); };
  if (pr) pr.onclick = function() { try { window.print(); } catch (e) {} };
  var host = ${JSON.stringify(opts.thermalHost)};
  var mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || '') || (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches);
  var hint = document.querySelector('.hint');
  if (host === 'embedded') {
    if (hint) {
      hint.textContent = 'Se o sistema não abrir o diálogo, toca em «Imprimir pré-visualização». Cupom longo: «Baixar .prn» na app da térmica (RAW).';
    }
    function firePrint() { try { window.print(); } catch (e) {} }
    window.setTimeout(firePrint, 200);
    window.setTimeout(firePrint, 800);
  } else if (mobile) {
    if (hint) {
      hint.innerHTML = 'Telemóvel / Bluetooth: toque em <strong>Imprimir pré-visualização</strong> quando estiver pronto. Para RAW na app da térmica use <strong>Baixar .prn</strong>.';
    }
  } else {
    window.setTimeout(function() {
      try { window.print(); } catch (e) {}
    }, 320);
  }
})();`

  const paper = opts.paperMm === 58 ? 58 : 80
  const pageSize = paper === 58 ? '58mm auto' : '80mm auto'
  const bodyMax = paper === 58 ? '54mm' : '72mm'
  const cols = paper === 58 ? 32 : 48

  let previewSource = stripIllFormedPreviewChars(opts.asciiPreview)
  if (opts.thermalHost === 'embedded') {
    previewSource = clampAsciiPreviewForEmbeddedHost(previewSource)
  }
  const previewHtml = escapeHtml(
    previewSource.length > ASCII_PREVIEW_HTML_MAX
      ? `${previewSource.slice(0, ASCII_PREVIEW_HTML_MAX)}\n\n[... pré-visualização cortada; o ficheiro .prn tem o cupom completo.]`
      : previewSource
  )

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(opts.documentTitle)}</title>
<style>
  @page { size: ${pageSize}; margin: 2mm; }
  html, body { height: auto !important; min-height: 0 !important; }
  body {
    font-family: ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace;
    font-size: clamp(7.5px, 2.35vw, 10.5px);
    line-height: 1.38;
    margin: 0;
    padding: 8px;
    color: #111;
    box-sizing: border-box;
    max-width: min(${bodyMax}, 100%);
    -webkit-text-size-adjust: 100%;
  }
  #preview {
    box-sizing: border-box;
    display: block;
    width: ${cols}ch;
    max-width: 100%;
    margin: 0 auto 12px;
    padding: 0;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    white-space: pre;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    tab-size: 8;
    font-variant-numeric: tabular-nums;
    word-break: keep-all;
    overflow-wrap: normal;
  }
  .hint { font-size: 10px; line-height: 1.45; color: #555; margin-bottom: 8px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  button { cursor: pointer; padding: 8px 12px; font-size: 12px; border-radius: 8px; border: 1px solid #bbb; background: #f4f4f4; }
  @media print {
    .no-print { display: none !important; }
    body { padding: 3px; max-width: 100%; font-size: 9.5pt; }
    #preview { overflow-x: visible; white-space: pre; max-width: none; width: ${cols}ch; }
  }
</style></head><body>
<p class="hint no-print">Pré-visualização só ASCII para impressão pelo browser. Para RAW ESC/POS (CP850), use «Baixar .prn» ou porta série (${opts.baud} baud).</p>
<pre id="preview">${previewHtml}</pre>
<div class="actions no-print">
  <button type="button" id="dl">Baixar ESC/POS (.prn)</button>
  <button type="button" id="se">Enviar porta série…</button>
  <button type="button" id="pr">Imprimir pré-visualização</button>
</div>
<script>${script}</script>
</body></html>`
}

function buildThermalDownloadOnlyHtml(
  documentTitle: string,
  filename: string,
  opts?: { autoFileSent?: boolean }
): string {
  const autoSent = opts?.autoFileSent === true
  const extra = autoSent
    ? `<p>O ficheiro <code>${escapeHtml(filename)}</code> deve ter sido enviado para as <strong>transferências</strong>. Abre-o na app da tua impressora Bluetooth (RAW / ESC-POS).</p>
<p>Se não apareceu, volta ao painel e usa <strong>Baixar .prn</strong> na janela do cupom.</p>`
    : `<p>Neste dispositivo não coube guardar o cupom completo na memória do navegador.</p>
<p>Abre <strong>Pedidos</strong> e usa «Imprimir» de novo, ou tenta noutro telemóvel / computador. Podes ainda usar «Baixar .prn» na janela do cupom quando a abrires a partir de um gesto (toque).</p>
<p>Ficheiro sugerido: <code>${escapeHtml(filename)}</code></p>`

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(documentTitle)}</title>
<style>
  body { font-family: system-ui, sans-serif; font-size: 14px; padding: 16px; color: #111; line-height: 1.45; }
  code { font-size: 12px; word-break: break-all; }
</style></head><body>
<p>O cupom térmico é grande para este telemóvel guardar na memória do navegador.</p>
${extra}
</body></html>`
}

function attachAfterPrintClose(win: Window): void {
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
    }, 200)
  }
  try {
    win.addEventListener('afterprint', closeAfterPrint)
  } catch {
    /* ignore */
  }
}

function writeThermalDoc(win: Window, html: string): void {
  win.document.open()
  win.document.write(html)
  win.document.close()
  attachAfterPrintClose(win)
}

/**
 * Janela ou iframe same-origin com pré-visualização ASCII, .prn manual e Web Serial.
 * No telemóvel usa iframe + impressão automática para contornar bloqueio de `window.open`.
 */
export function openThermalEscPosWindow(opts: ThermalEscPosWindowOpts): ThermalOpenResult {
  if (typeof window === 'undefined') return 'failed'

  const b64 = uint8ToBase64(opts.escPosBytes)
  const baud = Number.isFinite(opts.serialBaud) && opts.serialBaud > 0 ? opts.serialBaud : 9600
  const filename = `${opts.safeFilenameStem}.prn`
  const payload = prepareEscPosHtmlPayload(b64, filename, baud)
  const mobile = isMobileThermalHost()
  const thermalHost: 'popup' | 'embedded' = mobile ? 'embedded' : 'popup'
  const paper: PaperMm =
    opts.paperMm === 58 || opts.paperMm === 80 ? opts.paperMm : DEFAULT_PAPER_MM

  if (payload.kind === 'downloadOnly') {
    const fallbackHtml = buildThermalDownloadOnlyHtml(opts.documentTitle, filename)
    if (mobile && writeThermalToHiddenIframe(fallbackHtml)) {
      logPrintJob({
        phase: 'iframe_host_print',
        orderId: opts.logOrderId,
        bytesLength: opts.escPosBytes.length,
      })
      return 'opened'
    }
    const winDl = window.open('', '_blank', 'width=420,height=720')
    if (!winDl) {
      logPrintJob({
        phase: 'popup_blocked',
        orderId: opts.logOrderId,
        bytesLength: opts.escPosBytes.length,
      })
      return 'failed'
    }
    writeThermalDoc(winDl, fallbackHtml)
    logPrintJob({
      phase: 'window_open',
      orderId: opts.logOrderId,
      bytesLength: opts.escPosBytes.length,
    })
    return 'opened'
  }

  const html = buildThermalTicketHtml({
    documentTitle: opts.documentTitle,
    filename,
    baud,
    asciiPreview: opts.asciiPreview,
    payload,
    thermalHost,
    paperMm: paper,
  })

  if (mobile && writeThermalToHiddenIframe(html)) {
    logPrintJob({
      phase: 'iframe_host_print',
      orderId: opts.logOrderId,
      bytesLength: opts.escPosBytes.length,
    })
    return 'opened'
  }

  const win = window.open('', '_blank', 'width=420,height=720')
  if (!win) {
    logPrintJob({
      phase: 'popup_blocked',
      orderId: opts.logOrderId,
      bytesLength: opts.escPosBytes.length,
    })
    return 'failed'
  }

  logPrintJob({
    phase: 'window_open',
    orderId: opts.logOrderId,
    bytesLength: opts.escPosBytes.length,
  })

  writeThermalDoc(win, html)

  return 'opened'
}
