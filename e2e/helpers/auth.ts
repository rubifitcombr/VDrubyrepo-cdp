import type { Page } from '@playwright/test'
import type { Session } from '@supabase/supabase-js'
import { createMagicLinkSession } from './supabase-admin'

function supabaseProjectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente')
  const host = new URL(url).hostname
  return host.split('.')[0] ?? host
}

function authCookieName(): string {
  return `sb-${supabaseProjectRef()}-auth-token`
}

/** Persiste sessão Supabase nos cookies do browser (formato @supabase/ssr). */
export async function injectSupabaseSession(
  page: Page,
  session: Session,
  baseURL: string
): Promise<void> {
  const host = new URL(baseURL).hostname
  const cookieValue = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  })

  await page.context().addCookies([
    {
      name: authCookieName(),
      value: cookieValue,
      domain: host,
      path: '/',
      httpOnly: false,
      secure: baseURL.startsWith('https'),
      sameSite: 'Lax',
    },
  ])
}

export async function loginOwnerViaMagicLink(
  page: Page,
  email: string,
  baseURL: string
): Promise<void> {
  const redirectTo = `${baseURL}/dashboard`
  const session = await createMagicLinkSession(email, redirectTo)
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await injectSupabaseSession(page, session, baseURL)

  const syncRes = await page.request.post(`${baseURL}/api/auth/sync-usuario`)
  if (!syncRes.ok()) {
    throw new Error(
      `POST /api/auth/sync-usuario falhou (${syncRes.status()}): ${await syncRes.text()}`
    )
  }

  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'domcontentloaded' })
}
