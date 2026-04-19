export type MerchantStatus = 'pendente' | 'ativo' | 'bloqueado' | 'cancelado'

export function parseMerchantStatus(v: unknown): MerchantStatus {
  const s = String(v || '').toLowerCase()
  if (
    s === 'pendente' ||
    s === 'ativo' ||
    s === 'bloqueado' ||
    s === 'cancelado'
  ) {
    return s
  }
  return 'pendente'
}

export function statusBadgeClass(s: MerchantStatus): string {
  switch (s) {
    case 'pendente':
      return 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/80'
    case 'ativo':
      return 'bg-emerald-50 text-[var(--dash-success)] ring-1 ring-emerald-200/80'
    case 'bloqueado':
      return 'bg-red-50 text-red-800 ring-1 ring-red-200/80'
    case 'cancelado':
      return 'bg-[#f3f4f6] text-[#6b7280] ring-1 ring-black/10'
    default:
      return 'bg-[#f3f4f6] text-[#374151] ring-1 ring-black/5'
  }
}

export function statusLabel(s: MerchantStatus): string {
  switch (s) {
    case 'pendente':
      return 'Pendente'
    case 'ativo':
      return 'Ativo'
    case 'bloqueado':
      return 'Bloqueado'
    case 'cancelado':
      return 'Cancelado'
    default:
      return s
  }
}
