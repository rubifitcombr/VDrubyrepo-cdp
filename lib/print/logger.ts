export type PrintLogPhase =
  | 'build_start'
  | 'build_lines'
  | 'sanitize'
  | 'encode_cp850'
  | 'window_open'
  | 'iframe_host_print'
  | 'popup_blocked'
  | 'download'
  | 'serial_error'
  | 'error'

function debugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage?.getItem('vyria_print_debug') === '1'
  } catch {
    return false
  }
}

export function logPrintJob(entry: {
  phase: PrintLogPhase
  orderId?: string
  detail?: string
  bytesLength?: number
}): void {
  if (!debugEnabled()) return
  try {
    console.debug('[vyria-print]', entry.phase, {
      orderId: entry.orderId,
      detail: entry.detail,
      bytes: entry.bytesLength,
    })
  } catch {
    /* ignore */
  }
}
