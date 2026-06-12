// lib/escpos.ts — gerador usado pelo Print Agent.
// Mantém compatibilidade com o nome legado `gerarCupomPedido`, mas usa os mesmos
// templates, largura de papel e encoding CP850 do caminho browser (`lib/print`).

import type { PaperMm } from '@/lib/print/layout'
import type { StoreOrderRow } from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'
import {
  buildOrderTicketEscPos,
  type OrderTicketVariant,
} from '@/lib/print'

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

export function gerarCupomPedido(pedido: {
  id: string
  store_name: string
  customer_name?: string
  customer_phone?: string
  delivery_address?: string
  delivery_fee?: number | string | null
  payment_method?: string
  payment_status?: string | null
  notes?: string
  total: number
  items_summary?: string | null
  items?: Array<{ name: string; quantity: number; unit_price: number }>
  source?: string
  source_mesa?: string
  created_at: string
  paper_mm?: PaperMm
  variant?: OrderTicketVariant
  printing?: Pick<
    StorePrintingState,
    'print_include_customer_details' | 'print_delivery_copy' | 'print_paper_mm'
  >
}): string {
  const paper = pedido.paper_mm ?? pedido.printing?.print_paper_mm ?? 80
  const printing = pedido.printing ?? {
    print_include_customer_details: true,
    print_delivery_copy: false,
    print_paper_mm: paper,
  }
  const order: StoreOrderRow = {
    id: pedido.id,
    customer_name: pedido.customer_name ?? null,
    customer_phone: pedido.customer_phone ?? null,
    delivery_address: pedido.delivery_address ?? null,
    delivery_fee: pedido.delivery_fee ?? null,
    payment_method: pedido.payment_method ?? null,
    payment_status: pedido.payment_status ?? null,
    notes: pedido.notes ?? null,
    total: pedido.total,
    status: null,
    created_at: pedido.created_at,
    source: pedido.source ?? null,
    items_summary: pedido.items_summary ?? buildItemsSummary(pedido.items ?? []),
  }

  return bytesToBase64(
    buildOrderTicketEscPos({
      storeName: pedido.store_name,
      order,
      orderDisplayRef: pedido.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
      printing,
      paperMm: paper,
      variant: pedido.variant,
    })
  )
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) n = 0
  return `R$ ${n.toFixed(2).replace('.', ',')}`
}

function buildItemsSummary(
  items: Array<{ name: string; quantity: number; unit_price: number }>
): string {
  return items
    .map((item) => {
      const quantity = Number(item.quantity) || 0
      const unit = Number(item.unit_price) || 0
      const total = quantity * unit
      return `${quantity}x ${item.name} (un ${fmtMoney(unit)})=${fmtMoney(total)}`
    })
    .join('; ')
}
