'use client'

import Link from 'next/link'
import { useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ReportsDashboardData } from '@/lib/reports-data'

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } }

const moneyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

function ensureSpace(
  doc: jsPDF,
  y: number,
  pageH: number,
  margin: number,
  needMm: number
): number {
  if (y + needMm > pageH - margin) {
    doc.addPage()
    return margin + 4
  }
  return y
}

function nextAfterTable(doc: jsPDF, gapMm: number): number {
  const lt = (doc as DocWithTable).lastAutoTable
  return (lt?.finalY ?? 0) + gapMm
}

function buildPdf(data: ReportsDashboardData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageH = doc.internal.pageSize.getHeight()
  const pageW = doc.internal.pageSize.getWidth()
  const m = 14
  const maxW = pageW - m * 2
  const lineStep = 5.2
  let y = m

  const addHeading = (text: string) => {
    y = ensureSpace(doc, y, pageH, m, 12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(26, 22, 20)
    doc.text(text, m, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
  }

  const addLines = (lines: string[]) => {
    for (const line of lines) {
      if (!line) continue
      const wrapped = doc.splitTextToSize(line, maxW)
      y = ensureSpace(doc, y, pageH, m, wrapped.length * lineStep + 2)
      doc.setTextColor(55, 65, 81)
      doc.text(wrapped, m, y)
      y += wrapped.length * lineStep + 2
    }
    doc.setTextColor(0, 0, 0)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(26, 22, 20)
  doc.text('Vyria — Relatórios', m, y)
  y += 9
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128)
  doc.text(
    `Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — America/São Paulo`,
    m,
    y
  )
  y += 10
  doc.setTextColor(0, 0, 0)

  if (!data.hasEnoughData) {
    addLines([
      'Ainda há poucos pedidos para relatórios completos (mínimo 3 pedidos nos últimos dias).',
      'Os blocos abaixo refletem o que estiver disponível.',
    ])
    y += 4
  }

  if (data.insights.length) {
    addHeading('Insights automáticos')
    data.insights.forEach((t, i) => {
      const wrapped = doc.splitTextToSize(`${i + 1}. ${t}`, maxW)
      y = ensureSpace(doc, y, pageH, m, wrapped.length * lineStep + 2)
      doc.text(wrapped, m, y)
      y += wrapped.length * lineStep + 2
    })
    y += 4
  }

  if (data.recommendations.length) {
    addHeading('Recomendações do sistema')
    data.recommendations.forEach((t, i) => {
      const wrapped = doc.splitTextToSize(`${i + 1}. ${t}`, maxW)
      y = ensureSpace(doc, y, pageH, m, wrapped.length * lineStep + 2)
      doc.text(wrapped, m, y)
      y += wrapped.length * lineStep + 2
    })
    y += 4
  }

  addHeading('Ticket médio (7 dias)')
  const pct =
    data.ticket.pctChangeVsPrev7d != null
      ? `${data.ticket.pctChangeVsPrev7d > 0 ? '+' : ''}${data.ticket.pctChangeVsPrev7d}%`
      : '—'
  addLines([
    `Média atual: ${moneyFmt.format(data.ticket.avgCurrent7d)}`,
    `Média período anterior: ${moneyFmt.format(data.ticket.avgPrev7d)}`,
    `Variação: ${pct}`,
    `Pedidos nos últimos 7 dias: ${data.ticket.ordersLast7d}`,
    `Projeção com +R$ 5,00 por pedido: ~${moneyFmt.format(data.ticket.projectedMonthlyGainIfTicketPlus5)} / mês (linear, aprox.)`,
  ])
  y += 4

  addHeading('Mix de pagamentos (30 dias)')
  addLines([
    `PIX: ${moneyFmt.format(data.payment.pix)} (${data.payment.pixPct}% do total com método registado)`,
    `Cartão: ${moneyFmt.format(data.payment.card)}`,
    `Dinheiro: ${moneyFmt.format(data.payment.cash)}`,
    `Outros: ${moneyFmt.format(data.payment.other)}`,
  ])
  y += 4

  addHeading('Financeiro do Caixa')
  if (data.finance.missingTable) {
    addLines(['Migração do Financeiro ainda não aplicada no banco de dados.'])
  } else if (!data.finance.hasData) {
    addLines(['Sem lançamentos financeiros cadastrados ainda.'])
  } else {
    addLines([
      `Hoje: receitas ${moneyFmt.format(data.finance.today.receitas)}, despesas ${moneyFmt.format(data.finance.today.despesas)}, saldo ${moneyFmt.format(data.finance.today.saldo)}.`,
      `7 dias: receitas ${moneyFmt.format(data.finance.d7.receitas)}, despesas ${moneyFmt.format(data.finance.d7.despesas)}, saldo ${moneyFmt.format(data.finance.d7.saldo)}.`,
      `30 dias: receitas ${moneyFmt.format(data.finance.d30.receitas)}, despesas ${moneyFmt.format(data.finance.d30.despesas)}, saldo ${moneyFmt.format(data.finance.d30.saldo)}.`,
      `Contas pendentes em aberto: ${moneyFmt.format(data.finance.allPending)}.`,
    ])
    if (data.finance.topPendingSuppliers.length > 0) {
      y = ensureSpace(doc, y, pageH, m, 30)
      autoTable(doc, {
        startY: y,
        head: [['Fornecedor', 'Categoria', 'Contas pendentes']],
        body: data.finance.topPendingSuppliers.map((s) => [
          s.nome,
          s.categoria ?? '—',
          moneyFmt.format(s.contasPendentes),
        ]),
        margin: { left: m, right: m },
        headStyles: { fillColor: [234, 88, 12], textColor: 255 },
        styles: { fontSize: 8 },
        theme: 'striped',
      })
      y = nextAfterTable(doc, 10)
    }
  }
  y += 4

  addHeading('Horários')
  addLines([
    `Pico: ${data.peakRangeLabel}`,
    data.deadHourLabel ? `Mais calmo: ${data.deadHourLabel}` : '',
  ])
  y += 6

  y = ensureSpace(doc, y, pageH, m, 40)
  autoTable(doc, {
    startY: y,
    head: [['Dia', 'Faturamento', 'Pedidos']],
    body: data.performance.d7.map((p) => [
      p.label,
      moneyFmt.format(p.revenue),
      String(p.orders),
    ]),
    margin: { left: m, right: m },
    headStyles: { fillColor: [234, 88, 12], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 2 },
    theme: 'striped',
    tableWidth: 'auto',
  })
  doc.setFontSize(10)
  y = nextAfterTable(doc, 10)

  addHeading('Faturamento — últimos 30 dias')
  y = ensureSpace(doc, y, pageH, m, 40)
  autoTable(doc, {
    startY: y,
    head: [['Dia', 'Faturamento', 'Pedidos']],
    body: data.performance.d30.map((p) => {
      const dk = p.dateKey
      const fallback =
        dk && dk.length >= 10 ? `${dk.slice(8, 10)}/${dk.slice(5, 7)}` : '—'
      return [
        p.label || fallback,
        moneyFmt.format(p.revenue),
        String(p.orders),
      ]
    }),
    margin: { left: m, right: m },
    headStyles: { fillColor: [234, 88, 12], textColor: 255 },
    styles: { fontSize: 8, cellPadding: 1.5 },
    theme: 'striped',
    showHead: 'everyPage',
  })
  y = nextAfterTable(doc, 10)

  const prodHead: [string, string, string][] = [['Produto', 'Qtd', 'Receita']]

  addHeading('Produtos — mais vendidos (quantidade)')
  y = ensureSpace(doc, y, pageH, m, 30)
  autoTable(doc, {
    startY: y,
    head: prodHead,
    body: data.products.topByQty.map((p) => [
      p.name.length > 55 ? `${p.name.slice(0, 52)}...` : p.name,
      String(p.quantity),
      moneyFmt.format(p.revenue),
    ]),
    margin: { left: m, right: m },
    headStyles: { fillColor: [234, 88, 12], textColor: 255 },
    styles: { fontSize: 8 },
    theme: 'striped',
    showHead: 'everyPage',
  })
  y = nextAfterTable(doc, 10)

  addHeading('Produtos — maior faturamento')
  y = ensureSpace(doc, y, pageH, m, 30)
  autoTable(doc, {
    startY: y,
    head: prodHead,
    body: data.products.topByRevenue.map((p) => [
      p.name.length > 55 ? `${p.name.slice(0, 52)}...` : p.name,
      String(p.quantity),
      moneyFmt.format(p.revenue),
    ]),
    margin: { left: m, right: m },
    headStyles: { fillColor: [234, 88, 12], textColor: 255 },
    styles: { fontSize: 8 },
    theme: 'striped',
    showHead: 'everyPage',
  })
  y = nextAfterTable(doc, 10)

  addHeading('Produtos — pouco vendidos')
  if (data.products.slowMovers.length === 0) {
    addLines(['Nenhum produto nesta categoria no período.'])
    y += 4
  } else {
    y = ensureSpace(doc, y, pageH, m, 30)
    autoTable(doc, {
      startY: y,
      head: prodHead,
      body: data.products.slowMovers.map((p) => [
        p.name.length > 55 ? `${p.name.slice(0, 52)}...` : p.name,
        String(p.quantity),
        moneyFmt.format(p.revenue),
      ]),
      margin: { left: m, right: m },
      headStyles: { fillColor: [234, 88, 12], textColor: 255 },
      styles: { fontSize: 8 },
      theme: 'striped',
      showHead: 'everyPage',
    })
    y = nextAfterTable(doc, 10)
  }

  if (data.weighable && data.weighable.weighableLines > 0) {
    addHeading('Vendas por peso (kg)')
    addLines([
      `Total: ${data.weighable.totalWeightKg.toFixed(3).replace('.', ',')} kg`,
      `Faturamento pesável: ${moneyFmt.format(data.weighable.totalRevenue)}`,
      `Pesagens: ${data.weighable.weighableLines}`,
    ])
    if (data.weighable.topByWeight.length > 0) {
      y = ensureSpace(doc, y, pageH, m, 30)
      autoTable(doc, {
        startY: y,
        head: [['Produto', 'Kg', 'Receita', 'Pesagens']],
        body: data.weighable.topByWeight.map((p) => [
          p.name.length > 45 ? `${p.name.slice(0, 42)}...` : p.name,
          p.weightKg.toFixed(3).replace('.', ','),
          moneyFmt.format(p.revenue),
          String(p.lines),
        ]),
        margin: { left: m, right: m },
        headStyles: { fillColor: [16, 185, 129], textColor: 255 },
        styles: { fontSize: 8 },
        theme: 'striped',
        showHead: 'everyPage',
      })
      y = nextAfterTable(doc, 10)
    }
  }

  if (data.promo) {
    addHeading('Promoções (aproximação)')
    addLines([
      `${data.promo.ordersWithPromoLine} pedido(s) com pelo menos um item em promoção (SKU atual).`,
      `${data.promo.promoSharePct}% das unidades em linhas com produto em promoção no cardápio.`,
    ])
  }

  if (data.advanced) {
    const a = data.advanced.rolling30VsPrior30
    addHeading('Relatórios avançados (30 vs 30 dias)')
    const pct =
      a.revenuePctChange == null
        ? '—'
        : `${a.revenuePctChange > 0 ? '+' : ''}${a.revenuePctChange}%`
    addLines([
      `Faturamento — últimos 30 dias: ${moneyFmt.format(a.revenueCurrent)} · 30 dias anteriores: ${moneyFmt.format(a.revenuePrevious)} (variação ${pct}).`,
      `Pedidos — últimos 30 dias: ${a.ordersCurrent} · 30 dias anteriores: ${a.ordersPrevious}.`,
    ])
  }

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`Vyria · Página ${i} de ${pageCount}`, m, pageH - 8)
    doc.setTextColor(0, 0, 0)
  }

  return doc
}

export function ReportsExportButton({
  data,
  allowExport,
}: {
  data: ReportsDashboardData
  allowExport: boolean
}) {
  const [busy, setBusy] = useState(false)

  function download() {
    setBusy(true)
    try {
      const doc = buildPdf(data)
      const stamp = new Date().toISOString().slice(0, 10)
      doc.save(`vyria-relatorios-${stamp}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  if (!allowExport) {
    return (
      <Link
        href="/dashboard/upgrade?feature=reports"
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-violet-300/80 bg-violet-50/90 px-4 py-2.5 text-sm font-semibold text-violet-900 shadow-sm transition-colors hover:bg-violet-100/90"
      >
        <IconDownload className="h-4 w-4 text-violet-700" />
        PDF (plano Growth+)
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] shadow-sm transition-colors hover:border-[var(--dash-primary)]/25 hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <IconDownload className="h-4 w-4 text-[#6b7280]" />
      {busy ? 'A gerar PDF…' : 'Exportar PDF'}
    </button>
  )
}
