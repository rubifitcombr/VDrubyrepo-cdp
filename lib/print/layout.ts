export type PaperMm = 58 | 80

export function charWidthForPaper(mm: PaperMm): number {
  return mm === 58 ? 32 : 48
}

/** Largura por omissão: 80mm (48 colunas). */
export const DEFAULT_PAPER_MM: PaperMm = 80
