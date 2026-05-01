/** DTOs entregadores / entregas (painel Pedidos + Caixa). */

export type EntregadorTipo = 'fixo' | 'autonomo'

export type StoreEntregadorDTO = {
  id: string
  store_id: string
  nome: string
  telefone: string | null
  tipo: EntregadorTipo
  ativo: boolean
  criado_em: string
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
}

export function saldoEntregaLinha(e: EntregaDTO): number {
  return (
    Math.round((e.valor_recebido_cliente - e.valor_corrida) * 100) / 100
  )
}
