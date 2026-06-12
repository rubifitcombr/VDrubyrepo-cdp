export type FinancialEntryType = 'receita' | 'despesa'

export type FinancialEntryStatus = 'pendente' | 'pago'

export type SupplierDTO = {
  id: string
  store_id: string
  nome: string
  telefone: string | null
  email: string | null
  categoria: string | null
  created_at: string
  contas_pendentes: number
}

export type FinancialEntryDTO = {
  id: string
  store_id: string
  tipo: FinancialEntryType
  categoria: string
  supplier_id: string | null
  supplier_nome: string | null
  descricao: string
  valor: number
  vencimento: string | null
  data_pagamento: string | null
  status: FinancialEntryStatus
  created_at: string
}

export type FinanceiroSnapshotDTO = {
  suppliers: SupplierDTO[]
  entries: FinancialEntryDTO[]
}
