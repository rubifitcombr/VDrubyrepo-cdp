import { buildOrganizationJsonLd } from '@/lib/site-metadata'

export function SiteOrganizationJsonLd() {
  const json = buildOrganizationJsonLd()
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  )
}
