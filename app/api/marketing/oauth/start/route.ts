import { NextResponse } from 'next/server'
import {
  assertMetaEnv,
  META_GRAPH_VERSION,
  META_OAUTH_SCOPES,
} from '@/lib/marketing/meta.server'
import { requireMarketingApiContext } from '@/lib/marketing/api-context.server'

export const dynamic = 'force-dynamic'

function buildOAuthUrl(storeId: string) {
  const env = assertMetaEnv()
  const scopes = META_OAUTH_SCOPES.join(',')

  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`)
  url.searchParams.set('client_id', env.appId)
  url.searchParams.set('redirect_uri', env.redirectUri)
  url.searchParams.set('scope', scopes)
  url.searchParams.set('state', storeId)
  return url
}

export async function GET() {
  const ctx = await requireMarketingApiContext()
  if (!ctx.ok) return ctx.response

  try {
    return NextResponse.redirect(buildOAuthUrl(ctx.storeId))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao iniciar conexão Meta.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST() {
  return GET()
}
