import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!url || !anonKey) {
    throw new Error(
      'Configuração do Supabase ausente. Define NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no deploy.'
    )
  }

  return createBrowserClient(
    url,
    anonKey,
    {
      cookieOptions: {
        // 30 dias para manter sessão entre fechamentos do navegador.
        lifetime: 60 * 60 * 24 * 30,
      },
    }
  )
}
