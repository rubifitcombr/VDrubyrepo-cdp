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

/**
 * Janela com pré-visualização ASCII, download .prn (RAW CP850) e Web Serial.
 */
export function openThermalEscPosWindow(opts: ThermalEscPosWindowOpts): boolean {
  if (typeof window === 'undefined') return false

  const b64 = uint8ToBase64(opts.escPosBytes)
  const baud = Number.isFinite(opts.serialBaud) && opts.serialBaud > 0 ? opts.serialBaud : 9600
  const filename = `${opts.safeFilenameStem}.prn`

  const win = window.open('', '_blank', 'width=420,height=720')
  if (!win) return false

  logPrintJob({
    phase: 'window_open',
    orderId: opts.logOrderId,
    bytesLength: opts.escPosBytes.length,
  })

  const script = `
(function(){
  var b64 = ${JSON.stringify(b64)};
  var filename = ${JSON.stringify(filename)};
  var baud = ${JSON.stringify(baud)};
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

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/>
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
<p class="hint no-print">Pré-visualização só ASCII para impressão pelo browser. Para RAW ESC/POS (CP850), use «Baixar .prn» ou porta série (${baud} baud).</p>
<pre id="preview">${escapeHtml(opts.asciiPreview)}</pre>
<div class="actions no-print">
  <button type="button" id="dl">Baixar ESC/POS (.prn)</button>
  <button type="button" id="se">Enviar porta série…</button>
  <button type="button" id="pr">Imprimir pré-visualização</button>
</div>
<script>${script}</script>
</body></html>`

  win.document.open()
  win.document.write(html)
  win.document.close()

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

  return true
}
