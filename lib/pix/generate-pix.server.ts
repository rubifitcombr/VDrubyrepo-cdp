import 'server-only'

import { createStaticPix, hasError } from 'pix-utils'
import QRCode from 'qrcode'

export type GeneratePixInput = {
  pixKey: string
  merchantName: string
  merchantCity: string
  amount: number
  orderId: string
  infoAdicional?: string
}

export type GeneratePixResult = {
  pixPayload: string
  qrCode: string
}

/** Normaliza texto para campos do BR Code (sem acentos, tamanho limitado). */
function brCodeText(value: string, maxLen: number): string {
  const ascii = value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .toUpperCase()
  return ascii.slice(0, maxLen) || 'LOJA'
}

/**
 * Gera payload PIX copia e cola (BR Code) + QR Code em base64 (data URL).
 * O pagamento vai directamente para a chave do estabelecimento.
 */
export async function generatePixCharge(
  input: GeneratePixInput
): Promise<GeneratePixResult> {
  const amount = Math.round(Number(input.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Valor do PIX inválido.')
  }

  const pixKey = input.pixKey.trim()
  if (!pixKey) {
    throw new Error('Chave PIX não configurada.')
  }

  const merchantName = brCodeText(
    input.merchantName || 'LOJA',
    25
  )
  const merchantCity = brCodeText(
    input.merchantCity || 'BRASIL',
    15
  )
  const txid =
    String(input.orderId)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 25) || 'VYRIA001'

  const pix = createStaticPix({
    merchantName,
    merchantCity,
    pixKey,
    transactionAmount: amount,
    txid: txid.length >= 1 ? txid : 'VYRIA001',
    infoAdicional: (input.infoAdicional || `Pedido ${input.orderId.slice(0, 8)}`).slice(
      0,
      72
    ),
  })

  if (hasError(pix)) {
    throw new Error(
      typeof pix === 'object' && pix && 'message' in pix
        ? String((pix as { message?: string }).message)
        : 'Não foi possível gerar o código PIX.'
    )
  }

  const pixPayload = pix.toBRCode()
  const qrCode = await QRCode.toDataURL(pixPayload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280,
    color: { dark: '#1a1614', light: '#ffffff' },
  })

  return { pixPayload, qrCode }
}
