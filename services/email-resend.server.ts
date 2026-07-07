import 'server-only'

export type ResendAttachment = {
  filename: string
  content: string
  contentType?: string
}

type SendResendEmailInput = {
  to: string[]
  subject: string
  html: string
  attachments?: ResendAttachment[]
}

export async function sendResendEmail(
  input: SendResendEmailInput
): Promise<{ ok: boolean; skipped?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from =
    process.env.RESEND_FROM?.trim() || 'Vyria <onboarding@resend.dev>'

  if (!apiKey) {
    console.warn('[email-resend] RESEND_API_KEY em falta — email não enviado.')
    return { ok: false, skipped: 'no_resend_key' }
  }

  const to = input.to.map((e) => e.trim()).filter(Boolean)
  if (to.length === 0) {
    return { ok: false, skipped: 'no_recipients' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        content_type: a.contentType || 'application/pdf',
      })),
    }),
  })

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    console.error('[email-resend] Resend erro:', res.status, t)
    return { ok: false }
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string }
  return { ok: true, id: data.id }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
