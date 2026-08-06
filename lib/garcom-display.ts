import type { StoreGarcomDTO } from '@/lib/garcons-types'

/** Sufixo para distinguir garçons com o mesmo nome (ex. 3× «Aleksandra»). */
export function garcomDisambigSuffix(g: Pick<StoreGarcomDTO, 'id' | 'telefone'>): string {
  const phone = g.telefone?.replace(/\D/g, '') ?? ''
  if (phone.length >= 4) return phone.slice(-4)
  return g.id.slice(-4)
}

export function garcomDisambigLabel(
  g: Pick<StoreGarcomDTO, 'id' | 'nome' | 'telefone'>
): string {
  return `${g.nome} · ${garcomDisambigSuffix(g)}`
}

export function garconsNeedNameDisambiguation(
  garcons: Pick<StoreGarcomDTO, 'nome'>[]
): boolean {
  const seen = new Set<string>()
  for (const g of garcons) {
    const key = g.nome.trim().toLowerCase()
    if (!key) continue
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}
