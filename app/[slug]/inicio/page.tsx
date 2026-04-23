import { redirect } from 'next/navigation'
import { normalizePublicSlugSegment } from '@/lib/store-public-slug.server'

type Props = { params: Promise<{ slug: string }> }

export default async function LegacyInicioPathPage({ params }: Props) {
  const { slug: rawSlug } = await params
  const slug = normalizePublicSlugSegment(rawSlug)
  if (!slug) redirect('/')
  redirect(`/${encodeURIComponent(slug)}`)
}
