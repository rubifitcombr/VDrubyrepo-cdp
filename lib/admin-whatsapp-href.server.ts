import 'server-only'
import { buildWhatsAppLink } from '@/lib/whatsapp-number'

/** Link wa.me para suporte (NEXT_PUBLIC_ADMIN_WHATSAPP ou ADMIN_WHATSAPP). */
export function getAdminWhatsappHref(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_ADMIN_WHATSAPP?.trim() ||
    process.env.ADMIN_WHATSAPP?.trim() ||
    ''
  return buildWhatsAppLink(raw)
}
