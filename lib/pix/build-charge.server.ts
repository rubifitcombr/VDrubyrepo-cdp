import 'server-only'

import { generatePixCharge } from '@/lib/pix/generate-pix.server'
import { storePixCheckoutEnabled } from '@/lib/pix/key'

export type PixChargeResult = {
  copyPaste: string
  qrCodeDataUrl: string
  amount: number
  receiverName: string
  pixPayload: string
}

function readStorePixKey(store: Record<string, unknown>): string {
  return typeof store.pix_key === 'string' ? store.pix_key.trim() : ''
}

function readReceiverName(store: Record<string, unknown>): string {
  const fromPix =
    typeof store.pix_receiver_name === 'string'
      ? store.pix_receiver_name.trim()
      : ''
  if (fromPix) return fromPix.slice(0, 25)
  const storeName =
    typeof store.name === 'string' ? store.name.trim() : ''
  return storeName.slice(0, 25) || 'LOJA'
}

function readReceiverCity(store: Record<string, unknown>): string {
  const city =
    typeof store.pix_receiver_city === 'string'
      ? store.pix_receiver_city.trim()
      : ''
  return city.slice(0, 15) || 'BRASIL'
}

/**
 * Gera cobrança PIX estática para um pedido (dinheiro vai para o lojista).
 * Retorna null se PIX não estiver activo ou configurado.
 */
export async function buildPixChargeForOrder(args: {
  store: Record<string, unknown>
  orderId: string
  amount: number
  infoAdicional?: string
}): Promise<PixChargeResult | null> {
  if (!storePixCheckoutEnabled(args.store)) return null

  const pixKey = readStorePixKey(args.store)
  if (!pixKey) return null

  try {
    const { pixPayload, qrCode } = await generatePixCharge({
      pixKey,
      merchantName: readReceiverName(args.store),
      merchantCity: readReceiverCity(args.store),
      amount: args.amount,
      orderId: args.orderId,
      infoAdicional: args.infoAdicional,
    })

    const receiverName = readReceiverName(args.store)

    return {
      copyPaste: pixPayload,
      qrCodeDataUrl: qrCode,
      amount: Math.round(Number(args.amount) * 100) / 100,
      receiverName,
      pixPayload,
    }
  } catch (e) {
    console.error('[pix] buildPixChargeForOrder', e)
    return null
  }
}
