/** DTOs entregadores / entregas (painel Pedidos + Caixa). */

export type EntregadorTipo = 'fixo' | 'autonomo'

export type EntregadorStatusOperacional =
  | 'disponivel'
  | 'em_rota'
  | 'pausado'
  | 'indisponivel'

export type StoreEntregadorDTO = {
  id: string
  store_id: string
  nome: string
  telefone: string | null
  tipo: EntregadorTipo
  ativo: boolean
  criado_em: string
  status_operacional?: EntregadorStatusOperacional
  ultimo_status_em?: string
  valor_padrao_corrida?: number
}

export type EntregaDTO = {
  id: string
  store_id: string
  order_id: string
  entregador_id: string | null
  entregador_nome: string
  valor_corrida: number
  valor_recebido_cliente: number
  forma_pagamento_entrega: string | null
  turno_id: string | null
  observacao: string | null
  criado_em: string
  acerto_movimentacao_id?: string | null
  acertado_em?: string | null
}

export function saldoEntregaLinha(e: EntregaDTO): number {
  return (
    Math.round((e.valor_recebido_cliente - e.valor_corrida) * 100) / 100
  )
}

export function entregaPendenteAcerto(e: EntregaDTO): boolean {
  if (e.acertado_em) return false
  return Math.abs(saldoEntregaLinha(e)) >= 0.005
}
