import { createFetchWithTimeout } from '@/lib/supabase/fetch-with-timeout'

/** Timeout para chamadas Supabase no browser (login, sessão). */
export const SUPABASE_BROWSER_FETCH_TIMEOUT_MS = 15_000

/** Timeout para chamadas Supabase no servidor (cardápio, painel). */
export const SUPABASE_SERVER_FETCH_TIMEOUT_MS = 12_000

export function supabaseBrowserGlobalOptions() {
  return {
    global: {
      fetch: createFetchWithTimeout(SUPABASE_BROWSER_FETCH_TIMEOUT_MS),
    },
  } as const
}

export function supabaseServerGlobalOptions() {
  return {
    global: {
      fetch: createFetchWithTimeout(SUPABASE_SERVER_FETCH_TIMEOUT_MS),
    },
  } as const
}
