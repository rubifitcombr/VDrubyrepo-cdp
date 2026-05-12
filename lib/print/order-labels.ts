import { PRINT_PLACEHOLDER } from '@/lib/print/sanitize'
import { sanitizePrintText } from '@/lib/print/sanitize'

export function paymentMethodLabel(pm: string | null | undefined): string {
  const t = String(pm ?? '').trim().toLowerCase()
  if (t === 'cash' || t === 'dinheiro') return 'Dinheiro'
  if (t === 'pix') return 'PIX'
  if (t === 'card' || t === 'cartao' || t === 'cartão') return 'Cartao'
  if (t === 'credit' || t === 'credito' || t === 'crédito' || t === 'fiado') return 'Credito'
  const raw = sanitizePrintText(String(pm ?? '').trim())
  return raw || PRINT_PLACEHOLDER
}

export function sourceLabel(src: string | null | undefined): string {
  const t = String(src ?? '').trim().toLowerCase()
  if (t === 'waiter') return 'Garcom'
  if (t === 'pdv') return 'Balcao / PDV'
  if (t === 'site_pickup') return 'Retirada'
  if (t === 'menu_link' || t === '') return 'Cardapio online'
  const raw = sanitizePrintText(String(src ?? '').trim())
  return raw || PRINT_PLACEHOLDER
}
