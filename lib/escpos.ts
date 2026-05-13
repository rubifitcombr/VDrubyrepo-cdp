// lib/escpos.ts — comandos ESC/POS para impressora térmica 58 mm

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

export class EscPos {
  private buf: number[] = []

  init() {
    this.buf.push(ESC, 0x40)
    return this
  }

  align(a: 'left' | 'center' | 'right') {
    const map = { left: 0, center: 1, right: 2 }
    this.buf.push(ESC, 0x61, map[a])
    return this
  }

  bold(on: boolean) {
    this.buf.push(ESC, 0x45, on ? 1 : 0)
    return this
  }

  size(w: 1 | 2, h: 1 | 2) {
    const n = ((w - 1) << 4) | (h - 1)
    this.buf.push(GS, 0x21, n)
    return this
  }

  text(t: string) {
    const encoded = Buffer.from(t, 'latin1')
    encoded.forEach((b) => this.buf.push(b))
    return this
  }

  newline(n = 1) {
    for (let i = 0; i < n; i++) this.buf.push(LF)
    return this
  }

  divider(char = '-', len = 32) {
    return this.text(char.repeat(len)).newline()
  }

  cutPaper() {
    this.buf.push(GS, 0x56, 0x41, 0x00)
    return this
  }

  toBase64() {
    return Buffer.from(this.buf).toString('base64')
  }
}

export function gerarCupomPedido(pedido: {
  id: string
  store_name: string
  customer_name?: string
  customer_phone?: string
  delivery_address?: string
  payment_method?: string
  notes?: string
  total: number
  items: Array<{ name: string; quantity: number; unit_price: number }>
  source?: string
  source_mesa?: string
  created_at: string
}): string {
  const fmt = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

  const hora = new Date(pedido.created_at).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const p = new EscPos()
    .init()
    .align('center')
    .bold(true)
    .size(2, 2)
    .text(pedido.store_name.substring(0, 16))
    .newline()
    .size(1, 1)
    .bold(false)
    .newline()
    .align('left')
    .divider()
    .text(`Pedido: #${pedido.id.substring(0, 8).toUpperCase()}`)
    .newline()
    .text(`Hora:   ${hora}`)
    .newline()

  if (pedido.source_mesa) {
    p.text(`Mesa:   ${pedido.source_mesa}`).newline()
  }
  if (pedido.source === 'pdv') {
    p.text('Origem: Balcao').newline()
  }

  p.divider().bold(true).text('ITENS').newline().bold(false)

  pedido.items.forEach((item) => {
    const linha = `${item.quantity}x ${item.name}`
    const preco = fmt(item.unit_price * item.quantity)
    const spaces = Math.max(1, 32 - linha.length - preco.length)
    p.text(linha + ' '.repeat(spaces) + preco).newline()
  })

  p.divider().bold(true).text(`TOTAL: ${fmt(pedido.total)}`).newline().bold(false)

  if (pedido.payment_method) {
    const metodos: Record<string, string> = {
      pix: 'PIX',
      cash: 'Dinheiro',
      card: 'Cartao',
      dinheiro: 'Dinheiro',
      cartao: 'Cartao',
      credito: 'Credito',
      debito: 'Debito',
    }
    const m =
      metodos[pedido.payment_method] || pedido.payment_method
    p.text(`Pagamento: ${m}`).newline()
  }

  if (pedido.customer_name) {
    p.divider().text(`Cliente: ${pedido.customer_name}`).newline()
  }
  if (pedido.customer_phone) {
    p.text(`Tel: ${pedido.customer_phone}`).newline()
  }
  if (pedido.delivery_address) {
    p.text('Endereco:').newline()
      .text(pedido.delivery_address.substring(0, 64))
      .newline()
  }
  if (pedido.notes) {
    p.divider()
      .bold(true)
      .text('OBS:')
      .bold(false)
      .newline()
      .text(pedido.notes.substring(0, 128))
      .newline()
  }

  p.divider()
    .align('center')
    .text('Obrigado pela preferencia!')
    .newline()
    .newline(3)
    .cutPaper()

  return p.toBase64()
}
