import type { CaixaPaymentBreakdown } from '@/lib/caixa-payments'
import type { CaixaMovimentacaoDTO, CaixaTurnoDTO } from '@/lib/caixa-types'
import { center, leftRight, moneyBrl, separator, truncate, wrapText } from '@/lib/print/formatter'
import type { PaperMm } from '@/lib/print/layout'
import { charWidthForPaper } from '@/lib/print/layout'
import { stringifySafe } from '@/lib/print/sanitize'

const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function movTipoLabel(t: CaixaMovimentacaoDTO['tipo']): string {
  if (t === 'sangria') return 'Sangria'
  if (t === 'suprimento') return 'Suprimento'
  return 'Acerto entreg.'
}

/** Cupom ESC/POS: resumo do turno de caixa aberto (sistema + movimentações). */
export function buildCaixaTurnoResumoText(opts: {
  storeName: string
  paperMm: PaperMm
  turno: CaixaTurnoDTO
  breakdown: CaixaPaymentBreakdown
  movimentacoes: CaixaMovimentacaoDTO[]
}): string {
  const w = charWidthForPaper(opts.paperMm)
  const line = (ch: string) => separator(ch, w)
  const name = stringifySafe(opts.storeName).trim() || 'VYRIA DELIVERY'
  const aberto = (() => {
    try {
      return dateTimeFmt.format(new Date(opts.turno.aberto_em))
    } catch {
      return stringifySafe(opts.turno.aberto_em)
    }
  })()

  const lines: string[] = [
    line('='),
    center(name.toUpperCase(), w),
    center('RESUMO DE CAIXA', w),
    line('='),
    '',
    leftRight('Aberto:', aberto, w),
    leftRight('Operador:', stringifySafe(opts.turno.operador), w),
    leftRight('Fundo inicial:', moneyBrl(opts.turno.fundo_inicial), w),
    '',
    line('-'),
    center('PAGAMENTOS (SISTEMA)', w),
    line('-'),
    '',
    leftRight(
      `Dinheiro (${opts.breakdown.dinheiro.count} ped.)`,
      moneyBrl(opts.breakdown.dinheiro.total),
      w
    ),
    '',
    leftRight(
      `PIX (${opts.breakdown.pix.count} ped.)`,
      moneyBrl(opts.breakdown.pix.total),
      w
    ),
    '',
    leftRight(
      `Cartao (${opts.breakdown.cartao.count} ped.)`,
      moneyBrl(opts.breakdown.cartao.total),
      w
    ),
    '',
    leftRight(
      `Credito (${opts.breakdown.credito.count} ped.)`,
      moneyBrl(opts.breakdown.credito.total),
      w
    ),
    '',
    line('-'),
    leftRight('TOTAL', moneyBrl(opts.breakdown.totalGeral), w),
    leftRight(
      'Pedidos fechados',
      String(opts.breakdown.pedidosFechados),
      w
    ),
    '',
    line('-'),
    center('MOVIMENTACOES', w),
    line('-'),
    '',
  ]

  if (!opts.movimentacoes.length) {
    lines.push('(Nenhuma neste turno)', '')
  } else {
    for (const m of opts.movimentacoes) {
      const head = `${movTipoLabel(m.tipo)}  ${moneyBrl(m.valor)}`
      lines.push(truncate(head, w))
      const motivo = stringifySafe(m.motivo)
      if (motivo) {
        for (const wl of wrapText(motivo, w - 2)) {
          lines.push(`  ${wl}`)
        }
      }
      lines.push('')
    }
  }

  lines.push(line('='), center('VYRIA DELIVERY', w), line('='))

  return lines.join('\n')
}
