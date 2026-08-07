/** Bump quando o menu/UI do painel mudar — força limpeza de cache no cliente. */
export const DASHBOARD_CLIENT_VERSION = '20260806-sync-determinism-v1'

export const SERVICE_WORKER_URL = `/sw.js?v=${DASHBOARD_CLIENT_VERSION}`
