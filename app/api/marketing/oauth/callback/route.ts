import { NextRequest, NextResponse } from 'next/server'
import {
  assertMetaEnv,
  metaFetch,
  metaGraphUrl,
  readMetaJson,
} from '@/lib/marketing/meta.server'
import { requireMarketingApiContext } from '@/lib/marketing/api-context.server'

export const dynamic = 'force-dynamic'

type TokenResponse = {
  access_token: string
  expires_in?: number
}

type MetaUserResponse = {
  id: string
  name?: string
}

type MetaPagesResponse = {
  data?: Array<{ id: string; name?: string; access_token?: string }>
}

type MetaInstagramResponse = {
  instagram_business_account?: { id: string }
}

type MetaInstagramProfileResponse = {
  id: string
  username?: string
}

type MetaAdAccountsResponse = {
  data?: Array<{ id: string; name?: string }>
}

export async function GET(req: NextRequest) {
  const ctx = await requireMarketingApiContext()
  if (!ctx.ok) return ctx.response

  const url = new URL(req.url)
  const code = url.searchParams.get('code')?.trim()
  const state = url.searchParams.get('state')?.trim()
  const error = url.searchParams.get('error_description') || url.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/dashboard/marketing?error=${encodeURIComponent(error)}`, req.url))
  }
  if (!code || state !== ctx.storeId) {
    return NextResponse.redirect(new URL('/dashboard/marketing?error=oauth_state', req.url))
  }

  try {
    const env = assertMetaEnv()
    const shortRes = await fetch(
      metaGraphUrl('oauth/access_token', {
        client_id: env.appId,
        client_secret: env.appSecret,
        redirect_uri: env.redirectUri,
        code,
      }),
      { cache: 'no-store' }
    )
    const shortToken = await readMetaJson<TokenResponse>(shortRes)

    const longToken = await metaFetch<TokenResponse>('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: env.appId,
      client_secret: env.appSecret,
      fb_exchange_token: shortToken.access_token,
    })

    const accessToken = longToken.access_token
    const me = await metaFetch<MetaUserResponse>('me', {
      fields: 'id,name',
      access_token: accessToken,
    })
    const pages = await metaFetch<MetaPagesResponse>('me/accounts', {
      access_token: accessToken,
    })
    const firstPage = pages.data?.[0] ?? null
    const pageToken = firstPage?.access_token || accessToken

    let instagramId: string | null = null
    let instagramUsername: string | null = null
    if (firstPage?.id) {
      try {
        const ig = await metaFetch<MetaInstagramResponse>(firstPage.id, {
          fields: 'instagram_business_account',
          access_token: pageToken,
        })
        instagramId = ig.instagram_business_account?.id ?? null
        if (instagramId) {
          const igProfile = await metaFetch<MetaInstagramProfileResponse>(instagramId, {
            fields: 'id,username',
            access_token: pageToken,
          })
          instagramUsername = igProfile.username ?? null
        }
      } catch {
        /* Sem instagram_basic: impulsionamos posts da Página Facebook. */
      }
    }

    const adAccounts = await metaFetch<MetaAdAccountsResponse>('me/adaccounts', {
      fields: 'id,name',
      access_token: accessToken,
    })

    const expiresInSeconds = longToken.expires_in ?? 60 * 24 * 60 * 60
    const { error: upsertErr } = await ctx.db.from('social_connections').upsert(
      {
        store_id: ctx.storeId,
        provider: 'meta',
        access_token: accessToken,
        long_lived_token: accessToken,
        token_expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
        facebook_user_id: me.id,
        page_id: firstPage?.id ?? null,
        page_name: firstPage?.name ?? null,
        page_access_token: firstPage?.access_token ?? null,
        instagram_id: instagramId,
        instagram_username: instagramUsername,
        ad_account_id: adAccounts.data?.[0]?.id ?? null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'store_id,provider' }
    )

    if (upsertErr) throw new Error(upsertErr.message)
    return NextResponse.redirect(new URL('/dashboard/marketing?connected=true', req.url))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao conectar com a Meta.'
    return NextResponse.redirect(
      new URL(`/dashboard/marketing?error=${encodeURIComponent(message)}`, req.url)
    )
  }
}
