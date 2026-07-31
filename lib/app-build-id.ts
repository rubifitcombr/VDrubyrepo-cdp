import { DASHBOARD_CLIENT_VERSION } from '@/lib/dashboard-client-version'

/** Identificador do build em produção (commit Vercel ou versão do painel). */
export function getAppBuildId(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  if (sha) return sha.slice(0, 12)
  return DASHBOARD_CLIENT_VERSION
}
