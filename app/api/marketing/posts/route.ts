import { NextResponse } from 'next/server'
import { requireMarketingApiContext } from '@/lib/marketing/api-context.server'
import {
  isTokenExpiredMetaError,
  metaFetch,
  tokenExpiredResponse,
} from '@/lib/marketing/meta.server'
import {
  getMarketingConnectionForStore,
  markMarketingConnectionExpired,
} from '@/services/marketing.server'

export const dynamic = 'force-dynamic'

type PagePostsResponse = {
  data?: Array<{
    id: string
    message?: string
    created_time?: string
    full_picture?: string
    status_type?: string
    attachments?: {
      data?: Array<{
        media_type?: string
        url?: string
        subattachments?: { data?: Array<{ media?: { image?: { src?: string } } }> }
      }>
    }
  }>
}

function postThumbnail(post: NonNullable<PagePostsResponse['data']>[number]): string | null {
  if (post.full_picture) return post.full_picture
  const att = post.attachments?.data?.[0]
  if (att?.url) return att.url
  const sub = att?.subattachments?.data?.[0]?.media?.image?.src
  return sub ?? null
}

function postMediaType(post: NonNullable<PagePostsResponse['data']>[number]): string {
  const att = post.attachments?.data?.[0]?.media_type
  if (att) return att
  const st = String(post.status_type ?? '').toLowerCase()
  if (st.includes('video')) return 'VIDEO'
  if (st.includes('photo')) return 'IMAGE'
  return 'IMAGE'
}

export async function GET() {
  const ctx = await requireMarketingApiContext()
  if (!ctx.ok) return ctx.response

  const connection = await getMarketingConnectionForStore(ctx.storeId)
  const pageToken = connection?.page_access_token || connection?.access_token
  if (!connection?.page_id || !pageToken) {
    return NextResponse.json(
      {
        error:
          'Conta Meta conectada sem Página Facebook. Conecte uma página em que você seja administrador.',
      },
      { status: 400 }
    )
  }

  try {
    const posts = await metaFetch<PagePostsResponse>(`${connection.page_id}/posts`, {
      fields:
        'id,message,created_time,full_picture,status_type,attachments{media_type,url,subattachments}',
      limit: 20,
      access_token: pageToken,
    })
    return NextResponse.json({
      ok: true,
      source: 'facebook_page' as const,
      posts: (posts.data ?? []).map((p) => ({
        id: p.id,
        media_type: postMediaType(p),
        media_url: postThumbnail(p),
        thumbnail_url: postThumbnail(p),
        caption: p.message ?? '',
        timestamp: p.created_time ?? null,
      })),
    })
  } catch (err) {
    if (isTokenExpiredMetaError(err)) {
      await markMarketingConnectionExpired(connection.id)
      return NextResponse.json(tokenExpiredResponse(), { status: 401 })
    }
    const message = err instanceof Error ? err.message : 'Erro ao buscar posts da página.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
