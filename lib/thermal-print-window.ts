'use client'

import { uint8ToBase64 } from '@/lib/print/escpos'
import { logPrintJob } from '@/lib/print/logger'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type ThermalEscPosWindowOpts = {
  documentTitle: string
  safeFilenameStem: string
  asciiPreview: string
  escPosBytes: Uint8Array
  serialBaud: number
  logOrderId?: string
}

/** `window.open` falhou (típico em mobile com impressão assíncrona); fila + barra «Abrir cupom». */
export type ThermalOpenResult = 'opened' | 'queued_no_popup' | 'failed'

export const PENDING_THERMAL_PRINT_STORAGE_KEY = 'vyria-pending-print-v1'

export type PendingThermalPrintRow = {
  orderId?: string
  documentTitle: string
  safeFilenameStem: string
  asciiPreview: string
  b64: string
  serialBaud: number
  ts: number
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i) & 255
  return buf
}

function readQueueRaw(): PendingThermalPrintRow[] {
  try {
    const raw = sessionStorage.getItem(PENDING_THERMAL_PRINT_STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (x): x is PendingThermalPrintRow =>
        x &&
        typeof x === 'object' &&
        typeof (x as PendingThermalPrintRow).b64 === 'string' &&
        typeof (x as PendingThermalPrintRow).safeFilenameStem === 'string'
    )
  } catch {
    return []
  }
}

export function readPendingThermalPrintQueue(): PendingThermalPrintRow[] {
  return readQueueRaw().sort((a, b) => a.ts - b.ts)
}

export function removePendingThermalPrint(safeFilenameStem: string): void {
  try {
    const next = readQueueRaw().filter((r) => r.safeFilenameStem !== safeFilenameStem)
    if (next.length) {
      sessionStorage.setItem(PENDING_THERMAL_PRINT_STORAGE_KEY, JSON.stringify(next))
    } else {
      sessionStorage.removeItem(PENDING_THERMAL_PRINT_STORAGE_KEY)
    }
    window.dispatchEvent(new CustomEvent('vyria-pending-print'))
  } catch {
    /* ignore */
  }
}

function enqueuePendingThermal(
  opts: ThermalEscPosWindowOpts & { b64: string }
): void {
  try {
    const list = readQueueRaw()
    const row: PendingThermalPrintRow = {
      orderId: opts.logOrderId,
      documentTitle: opts.documentTitle,
      safeFilenameStem: opts.safeFilenameStem,
      asciiPreview: opts.asciiPreview,
      b64: opts.b64,
      serialBaud: opts.serialBaud,
      ts: Date.now(),
    }
    const withoutDup = list.filter(
      (r) =>
        r.safeFilenameStem !== opts.safeFilenameStem &&
        (opts.logOrderId ? r.orderId !== opts.logOrderId : true)
    )
    const next = [...withoutDup, row].slice(-12)
    sessionStorage.setItem(PENDING_THERMAL_PRINT_STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('vyria-pending-print'))
  } catch {
    /* ignore */
  }
}

function tryDownloadPrnInParent(bytes: Uint8Array, filename: string): void {
  try {
    const copy = Uint8Array.from(bytes)
    const blob = new Blob([copy], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    /* ignore */
  }
}

function buildThermalTicketHtml(opts: {
  documentTitle: string
  filename: string
  baud: number
  asciiPreview: string
  b64: string
}): string {
  const script = `
(function(){
  var b64 = ${JSON.stringify(opts.b64)};
  var filename = ${JSON.stringify(opts.filename)};
  var baud = ${JSON.stringify(opts.baud)};
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
  if (pr) pr.onclick = function() { window.print(); };
  setTimeout(function() {
    try { window.print(); } catch (e) {}
  }, 220);
})();`

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(opts.documentTitle)}</title>
<style>
  @page { size: 80mm auto; margin: 2mm; }
  body { font-family: ui-monospace, Consolas, "Courier New", monospace; font-size: 11px; margin: 0; padding: 10px; color: #111; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0 0 12px; }
  .hint { font-size: 10px; color: #555; margin-bottom: 8px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  button { cursor: pointer; padding: 8px 12px; font-size: 12px; border-radius: 8px; border: 1px solid #bbb; background: #f4f4f4; }
  @media print {
    .no-print { display: none !important; }
    body { padding: 4px; }
  }
</style></head><body>
<p class="hint no-print">Pré-visualização só ASCII para impressão pelo browser. Para RAW ESC/POS (CP850), use «Baixar .prn» ou porta série (${opts.baud} baud).</p>
<pre id="preview">${escapeHtml(opts.asciiPreview)}</pre>
<div class="actions no-print">
  <button type="button" id="dl">Baixar ESC/POS (.prn)</button>
  <button type="button" id="se">Enviar porta série…</button>
  <button type="button" id="pr">Imprimir pré-visualização</button>
</div>
<script>${script}</script>
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
 * Reabre cupom a partir da fila (deve ser chamado dentro de um toque do utilizador no mobile).
 */
export function reopenQueuedThermalPrint(row: PendingThermalPrintRow): ThermalOpenResult {
  if (typeof window === 'undefined') return 'failed'
  const bytes = base64ToUint8Array(row.b64)
  const filename = `${row.safeFilenameStem}.prn`
  const win = window.open('', '_blank', 'width=420,height=720')
  if (!win) {
    tryDownloadPrnInParent(bytes, filename)
    return 'queued_no_popup'
  }
  logPrintJob({
    phase: 'window_open',
    orderId: row.orderId,
    bytesLength: bytes.length,
  })
  const html = buildThermalTicketHtml({
    documentTitle: row.documentTitle,
    filename,
    baud: row.serialBaud,
    asciiPreview: row.asciiPreview,
    b64: row.b64,
  })
  writeThermalDoc(win, html)
  return 'opened'
}

/**
 * Janela com pré-visualização ASCII, download .prn (RAW CP850) e Web Serial.
 * Em mobile, `window.open` fora de gesto do utilizador costuma falhar: nesse caso
 * gravamos na fila, tentamos download do .prn e emitimos `vyria-pending-print`.
 */
export function openThermalEscPosWindow(opts: ThermalEscPosWindowOpts): ThermalOpenResult {
  if (typeof window === 'undefined') return 'failed'

  const b64 = uint8ToBase64(opts.escPosBytes)
  const baud = Number.isFinite(opts.serialBaud) && opts.serialBaud > 0 ? opts.serialBaud : 9600
  const filename = `${opts.safeFilenameStem}.prn`

  const win = window.open('', '_blank', 'width=420,height=720')
  if (!win) {
    logPrintJob({
      phase: 'popup_blocked',
      orderId: opts.logOrderId,
      bytesLength: opts.escPosBytes.length,
    })
    enqueuePendingThermal({ ...opts, b64 })
    tryDownloadPrnInParent(opts.escPosBytes, filename)
    return 'queued_no_popup'
  }

  logPrintJob({
    phase: 'window_open',
    orderId: opts.logOrderId,
    bytesLength: opts.escPosBytes.length,
  })

  const html = buildThermalTicketHtml({
    documentTitle: opts.documentTitle,
    filename,
    baud,
    asciiPreview: opts.asciiPreview,
    b64,
  })
  writeThermalDoc(win, html)

  return 'opened'
}
