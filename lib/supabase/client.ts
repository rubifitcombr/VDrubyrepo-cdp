import { createBrowserClient } from '@supabase/ssr'
import { supabaseBrowserGlobalOptions } from '@/lib/supabase/client-options'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!url || !anonKey) {
    throw new Error(
      'Configuração do Supabase ausente. Define NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no deploy.'
    )
  }

  return createBrowserClient(url, anonKey, {
    ...supabaseBrowserGlobalOptions(),
    cookieOptions: {
      // 30 dias (segundos) — alinhado com SerializeOptions do pacote `cookie` / @supabase/ssr
      maxAge: 60 * 60 * 24 * 30,
    },
  })
}
