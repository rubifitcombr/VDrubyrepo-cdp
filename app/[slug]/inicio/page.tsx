import { redirect } from 'next/navigation'
import { storefrontLegacyRedirectPath } from '@/lib/storefront-legacy-redirect'
import { normalizePublicSlugSegment } from '@/lib/store-public-slug.server'

type Props = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function LegacyInicioPathPage({
  params,
  searchParams,
}: Props) {
  const { slug: rawSlug } = await params
  const slug = normalizePublicSlugSegment(rawSlug)
  if (!slug) redirect('/')
  const sp = searchParams ? await searchParams : undefined
  redirect(storefrontLegacyRedirectPath(slug, sp))
}
