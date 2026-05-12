'use client'

/** Velocidades comuns em impressoras ESC/POS USB-Serial. */
export const PRINT_SERIAL_BAUD_OPTIONS = [
  9600, 19200, 38400, 57600, 115200,
] as const

const STORAGE_KEY = 'vyria_print_serial_baud'

function isAllowedBaud(n: number): n is (typeof PRINT_SERIAL_BAUD_OPTIONS)[number] {
  return (PRINT_SERIAL_BAUD_OPTIONS as readonly number[]).includes(n)
}

/** Lê baud guardado no browser (Web Serial). Omissão: 9600. */
export function getPrintSerialBaud(): number {
  if (typeof window === 'undefined') return 9600
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY)
    const n = raw != null ? Number(raw) : NaN
    if (Number.isFinite(n) && isAllowedBaud(n)) return n
  } catch {
    /* ignore */
  }
  return 9600
}

export function setPrintSerialBaud(baud: number): void {
  if (typeof window === 'undefined') return
  try {
    if (Number.isFinite(baud) && isAllowedBaud(baud)) {
      window.localStorage.setItem(STORAGE_KEY, String(baud))
    }
  } catch {
    /* ignore */
  }
}
