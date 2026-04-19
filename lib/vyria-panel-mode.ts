import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'

/** Cookie definido só para a conta Vyria admin (dual: gestão vs loja). */
export const VYRIA_PANEL_MODE_COOKIE = 'vyria_panel_mode'

export type VyriaPanelMode = 'admin' | 'lojista'

export function parseVyriaPanelMode(
  raw: string | null | undefined
): VyriaPanelMode {
  if (raw === 'admin' || raw === 'lojista') return raw
  return 'lojista'
}

/** Regras de lojista (plano, bloqueio, etc.) aplicam-se à conta Vyria só em modo lojista. */
export function shouldApplyLojistaRulesForVyriaUser(
  userId: string | null | undefined,
  mode: VyriaPanelMode
): boolean {
  if (!userId) return true
  if (!isVyriaAdminPanelUser(userId)) return true
  return mode === 'lojista'
}
