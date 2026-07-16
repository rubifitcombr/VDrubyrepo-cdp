/**
 * Verificação rápida das regras puras do Vyria Fiscal (sem runner externo).
 * Uso: node scripts/verify-fiscal.mjs
 */
import assert from 'node:assert/strict'

function paymentMethodToNfceForma(method) {
  const t = String(method ?? '').trim().toLowerCase()
  if (t === 'pix') return '17'
  if (t === 'card_debit' || t === 'debit' || t === 'debito') return '04'
  if (t === 'card_credit' || t === 'credit' || t === 'credito' || t === 'card') return '03'
  return '01'
}

function indicadorPresencaForOrder(opts) {
  const src = String(opts.source ?? '').trim().toLowerCase()
  const addr = String(opts.deliveryAddress ?? '').trim()
  const fee = Number(String(opts.deliveryFee ?? '').replace(',', '.')) || 0
  if (fee > 0 || addr.length > 0) return 4
  if (src === 'pdv' || src === 'waiter' || src === 'autoatendimento' || src === 'garcom') return 1
  return 1
}

const CFOPS = new Set([
  '5101', '5102', '5103', '5104', '5115', '5405', '5656', '5667', '5933', '6108', '6109', '6110',
])
function isNfceCfopValido(cfop) {
  return CFOPS.has(String(cfop ?? '').replace(/\D/g, ''))
}

function extractNfceQrCodeUrl(xml) {
  if (!xml?.trim()) return null
  const m = xml.match(/<qrCode[^>]*>([\s\S]*?)<\/qrCode>/i)
  if (!m?.[1]) return null
  const url = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').trim()
  return /^https?:\/\//i.test(url) ? url : null
}

function isNfceCancelavel(invoice, now = new Date()) {
  if (String(invoice.status ?? '').toLowerCase() !== 'autorizada') return false
  const emitted = new Date(invoice.emitida_em).getTime()
  if (!Number.isFinite(emitted)) return false
  return emitted + 30 * 60_000 > now.getTime()
}

assert.equal(paymentMethodToNfceForma('pix'), '17')
assert.equal(paymentMethodToNfceForma('card_debit'), '04')
assert.equal(paymentMethodToNfceForma('card'), '03')
assert.equal(indicadorPresencaForOrder({ source: 'pdv' }), 1)
assert.equal(indicadorPresencaForOrder({ source: 'web', deliveryFee: 8.5 }), 4)
assert.equal(isNfceCfopValido('5102'), true)
assert.equal(isNfceCfopValido('9999'), false)

const now = new Date('2026-07-16T12:00:00Z')
assert.equal(isNfceCancelavel({ status: 'autorizada', emitida_em: '2026-07-16T11:50:00Z' }, now), true)
assert.equal(isNfceCancelavel({ status: 'autorizada', emitida_em: '2026-07-16T10:00:00Z' }, now), false)

const xml =
  '<?xml version="1.0"?><infNFeSupl><qrCode><![CDATA[https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?chNFe=123]]></qrCode></infNFeSupl>'
assert.equal(
  extractNfceQrCodeUrl(xml),
  'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?chNFe=123'
)

console.log('verify-fiscal: ok')
