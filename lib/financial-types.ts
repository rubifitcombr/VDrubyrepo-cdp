export type FinancialEntryType = 'receita' | 'despesa'

export type FinancialEntryStatus = 'pendente' | 'pago'

export type SupplierDTO = {
  id: string
  store_id: string
  nome: string
  telefone: string | null
  email: string | null
  categoria: string | null
  cnpj: string | null
  observacao: string | null
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

/** Vendas entregues (PDV / delivery / salão) para o fechamento operacional. */
export type OperationalSaleDTO = {
  id: string
  total: number
  created_at: string
  source: string | null
  payment_method: string | null
}

export type FinanceiroSnapshotDTO = {
  suppliers: SupplierDTO[]
  entries: FinancialEntryDTO[]
  sales: OperationalSaleDTO[]
}

export const FINANCIAL_DESPESA_CATEGORIES = [
  'Insumos',
  'Bebidas',
  'Embalagens',
  'Aluguel',
  'Energia / água / gás',
  'Internet / telefone',
  'Folha / pró-labore',
  'Entrega / motoboy',
  'Marketing',
  'Manutenção',
  'Impostos / taxas',
  'Equipamentos',
  'Outros',
] as const

export const FINANCIAL_RECEITA_CATEGORIES = [
  'Venda avulsa',
  'Serviço',
  'Reembolso',
  'Aporte',
  'Outros',
] as const

export const FINANCIAL_SUPPLIER_CATEGORIES = [
  'Alimentos',
  'Bebidas',
  'Embalagens',
  'Limpeza',
  'Serviços',
  'Equipamentos',
  'Outros',
] as const

export function isFinancialEntryOverdue(entry: {
  tipo: FinancialEntryType
  status: FinancialEntryStatus
  vencimento: string | null
}, now = Date.now()): boolean {
  if (entry.tipo !== 'despesa' || entry.status !== 'pendente' || !entry.vencimento) return false
  const d = new Date(entry.vencimento)
  if (!Number.isFinite(d.getTime())) return false
  const endOfDue = new Date(d)
  endOfDue.setHours(23, 59, 59, 999)
  return endOfDue.getTime() < now
}
