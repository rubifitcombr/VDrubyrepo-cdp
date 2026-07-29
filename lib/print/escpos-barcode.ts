import { concatBytes } from '@/lib/print/escpos'

/** Imprime EAN-13 em impressoras ESC/POS compatíveis (12 dígitos sem verificador). */
export function encodeEan13EscPosBarcode(fullBarcode: string): Uint8Array {
  const digits = fullBarcode.replace(/\D/g, '')
  if (digits.length !== 13) {
    throw new Error('EAN-13 inválido para impressão.')
  }
  const payload = digits.slice(0, 12)
  const data = new TextEncoder().encode(payload)

  const barcodeCmd = new Uint8Array(4 + data.length)
  barcodeCmd[0] = 0x1d // GS
  barcodeCmd[1] = 0x6b // k
  barcodeCmd[2] = 67 // EAN-13
  barcodeCmd[3] = data.length
  barcodeCmd.set(data, 4)

  return concatBytes(
    Uint8Array.of(0x1d, 0x48, 2), // HRI abaixo
    Uint8Array.of(0x1d, 0x68, 72), // altura
    Uint8Array.of(0x1d, 0x77, 2), // largura
    barcodeCmd,
    Uint8Array.of(0x0a)
  )
}
