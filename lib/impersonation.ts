/**
 * "Acessar como lojista" (impersonation) — o admin Vyria assume a sessão de um
 * lojista para configurar a conta, sem precisar da senha dele.
 *
 * Segurança:
 * - Só o utilizador do painel admin pode iniciar (ver rota /api/admin/...).
 * - A sessão original do admin fica guardada num cookie httpOnly para poder
 *   voltar ("Voltar ao admin") sem novo login.
 * - Toda a ação fica registada em `admin_logs`.
 */

/** Guarda o refresh token da sessão do admin (httpOnly) para restaurar depois. */
export const IMPERSONATION_RESTORE_COOKIE = 'vyria_admin_restore'

/** Marca a sessão atual como impersonation e identifica a loja (httpOnly). */
export const IMPERSONATION_ACTIVE_COOKIE = 'vyria_impersonating'

export type ImpersonationContext = {
  storeId: string
  storeName: string
}

export function parseImpersonationContext(
  raw: string | null | undefined
): ImpersonationContext | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ImpersonationContext>
    const storeId = String(parsed.storeId ?? '').trim()
    if (!storeId) return null
    return {
      storeId,
      storeName: String(parsed.storeName ?? '').trim() || 'lojista',
    }
  } catch {
    return null
  }
}
