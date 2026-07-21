/**
 * Conta com acesso exclusivo ao painel `/admin`.
 * Override opcional: `VYRIA_ADMIN_USER_ID` (mesmo UUID em string).
 */
export const VYRIA_ADMIN_PANEL_USER_ID =
  '48357da1-a7f3-4b97-988b-1cefff055b7e'

export function getVyriaAdminPanelUserId(): string {
  const fromEnv =
    typeof process !== 'undefined'
      ? process.env.VYRIA_ADMIN_USER_ID?.trim()
      : undefined
  if (process.env.NODE_ENV === 'production' && !fromEnv) {
    throw new Error(
      'VYRIA_ADMIN_USER_ID é obrigatório em produção (UUID da conta admin Vyria).'
    )
  }
  return fromEnv || VYRIA_ADMIN_PANEL_USER_ID
}

export function isVyriaAdminPanelUser(
  userId: string | null | undefined
): boolean {
  if (!userId) return false
  return userId === getVyriaAdminPanelUserId()
}
