import 'server-only'

/** Link wa.me para suporte (NEXT_PUBLIC_ADMIN_WHATSAPP ou ADMIN_WHATSAPP). */
export function getAdminWhatsappHref(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_ADMIN_WHATSAPP?.trim() ||
    process.env.ADMIN_WHATSAPP?.trim() ||
    ''
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}`
}
