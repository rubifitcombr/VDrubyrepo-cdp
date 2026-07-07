export function storefrontLegacyRedirectPath(
  slug: string,
  searchParams?: Record<string, string | string[] | undefined>
): string {
  const qs = new URLSearchParams()
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === 'string') qs.set(key, value)
      else if (Array.isArray(value)) {
        for (const v of value) qs.append(key, v)
      }
    }
  }
  const query = qs.toString()
  return `/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`
}
