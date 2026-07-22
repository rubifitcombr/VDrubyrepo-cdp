/**
 * Conta com acesso exclusivo ao painel `/admin`.
 * Definir em deploy: `VYRIA_ADMIN_USER_ID` (UUID Supabase Auth).
 */
export function getVyriaAdminPanelUserId(): string | null {
  const id =
    typeof process !== 'undefined'
      ? process.env.VYRIA_ADMIN_USER_ID?.trim()
      : undefined
  return id || null
}

export function isVyriaAdminPanelUser(
  userId: string | null | undefined
): boolean {
  if (!userId) return false
  const adminId = getVyriaAdminPanelUserId()
  if (!adminId) return false
  return userId === adminId
}
