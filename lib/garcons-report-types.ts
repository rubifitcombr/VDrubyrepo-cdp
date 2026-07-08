export type GarcomReportRow = {
  garcom_id: string | null
  nome: string
  total_pedidos: number
  valor_pedidos: number
  ticket_medio: number
  taxa_servico: number
}

export type GarconsReportSummary = {
  faturamento: number
  ticket_medio: number
  total_pedidos: number
  taxa_servico: number
  garcons_ativos: number
}

export type GarconsReportDTO = {
  from: string
  to: string
  summary: GarconsReportSummary
  rows: GarcomReportRow[]
  missingColumns?: boolean
}
