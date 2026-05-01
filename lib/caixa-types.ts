/** DTOs partilhados entre servidor e cliente Caixa (sem server-only). */

export type CaixaTurnoDTO = {
  id: string
  store_id: string
  operador: string
  fundo_inicial: number
  aberto_em: string
  fechado_em: string | null
  status: 'aberto' | 'fechado'
  total_dinheiro: number
  total_pix: number
  total_cartao: number
  total_credito: number
  total_geral: number
  total_informado_dinheiro: number | null
  total_informado_pix: number | null
  total_informado_cartao: number | null
  total_informado_credito: number | null
  pedidos_fechados_count: number
  diferenca: number
  fundo_proximo_turno: number | null
}

export type CaixaMovimentacaoDTO = {
  id: string
  store_id: string
  turno_id: string
  tipo: 'suprimento' | 'sangria' | 'acerto_entregador'
  valor: number
  motivo: string | null
  operador: string | null
  criado_em: string
}
