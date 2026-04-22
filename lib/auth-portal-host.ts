/**
 * Hostnames onde a raiz `/` deve levar ao fluxo de autenticação (ex.: subdomínio "acesso").
 * Complementa `AUTH_PORTAL_HOSTS` (lista separada por vírgulas, sem protocolo).
 */
export function isAuthPortalHost(host: string): boolean {
  const h = host.trim().toLowerCase()
  if (!h) return false

  const fromEnv =
    process.env.AUTH_PORTAL_HOSTS?.split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean) ?? []
  if (fromEnv.includes(h)) return true

  return h.startsWith('acesso.')
}
