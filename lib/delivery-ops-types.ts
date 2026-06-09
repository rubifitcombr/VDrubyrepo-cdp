/** Tipos do painel operacional de entregadores. */

import type {
  EntregaDTO,
  EntregadorStatusOperacional,
  StoreEntregadorDTO,
} from '@/lib/entregas-types'
import type { StoreOrderRow } from '@/lib/store-order'

export type { EntregadorStatusOperacional }

export type StoreEntregadorOpsDTO = StoreEntregadorDTO & {
  status_operacional: EntregadorStatusOperacional
  ultimo_status_em: string
  valor_padrao_corrida: number
}

export type OrderOnRouteDTO = StoreOrderRow & {
  entregador_id: string | null
  entregador_nome: string | null
  entrega_despachada_em: string | null
  entrega_prazo_minutos: number
  display_ref?: string
  minutes_on_route?: number
  is_delayed?: boolean
}

export type CourierBalanceGroup = {
  key: string
  entregador_id: string | null
  nome: string
  entregas: EntregaDTO[]
  total_corrida: number
  total_recebido: number
  saldo: number
  pending_settlement: boolean
}

export type DeliveryOpsSummary = {
  disponiveis: number
  na_rua: number
  atrasados: number
  saldo_loja_deve: number
  saldo_entregador_deve: number
}

export type DeliveryOpsPayload = {
  summary: DeliveryOpsSummary
  on_route: OrderOnRouteDTO[]
  delayed: OrderOnRouteDTO[]
  couriers: StoreEntregadorOpsDTO[]
  balances: CourierBalanceGroup[]
  missingColumns?: boolean
}
