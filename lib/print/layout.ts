export type PaperMm = 58 | 80

/**
 * Colunas por papel. Valores conservadores: algumas térmicas têm área
 * imprimível menor que o nominal (48/32) e cortam a borda direita.
 */
export function charWidthForPaper(mm: PaperMm): number {
  return mm === 58 ? 30 : 42
}

/** Largura por omissão: 80mm (48 colunas). */
export const DEFAULT_PAPER_MM: PaperMm = 80
