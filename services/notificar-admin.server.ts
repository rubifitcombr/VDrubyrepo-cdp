import 'server-only'

type NotificarAdminNovoCadastroInput = {
  nomeLoja: string
  email: string
  telefone: string | null
  cadastradoEm: Date
}

type NotificarAdminListaInput = {
  assunto: string
  linhas: string[]
}

async function sendResendEmail(params: {
  subject: string
  html: string
}): Promise<{ ok: boolean; skipped?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const to = process.env.ADMIN_EMAIL?.trim()
  const from =
    process.env.RESEND_FROM?.trim() || 'Vyria <onboarding@resend.dev>'

  if (!apiKey) {
    console.warn('[notificar-admin] RESEND_API_KEY em falta — email não enviado.')
    return { ok: false, skipped: 'no_resend_key' }
  }
  if (!to) {
    console.warn('[notificar-admin] ADMIN_EMAIL em falta — email não enviado.')
    return { ok: false, skipped: 'no_admin_email' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: params.subject,
      html: params.html,
    }),
  })

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    console.error('[notificar-admin] Resend erro:', res.status, t)
    return { ok: false }
  }

  return { ok: true }
}

export async function notificarAdminNovoCadastro(
  input: NotificarAdminNovoCadastroInput
): Promise<void> {
  const when = input.cadastradoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const subject = `Novo cadastro Vyria — ${input.nomeLoja}`
  const html = `
    <p><strong>Novo cadastro</strong></p>
    <ul>
      <li><strong>Loja:</strong> ${escapeHtml(input.nomeLoja)}</li>
      <li><strong>Email:</strong> ${escapeHtml(input.email)}</li>
      <li><strong>Telefone:</strong> ${escapeHtml(input.telefone || '—')}</li>
      <li><strong>Data/hora:</strong> ${escapeHtml(when)}</li>
    </ul>
  `
  await sendResendEmail({ subject, html })
}

export async function notificarAdminListaVencimentos(
  input: NotificarAdminListaInput
): Promise<void> {
  const body = input.linhas.map((l) => `<li>${escapeHtml(l)}</li>`).join('')
  const html = `<p><strong>${escapeHtml(input.assunto)}</strong></p><ul>${body}</ul>`
  await sendResendEmail({ subject: input.assunto, html })
}

export async function notificarAdminSolicitacaoCancelamentoAssinatura(input: {
  nomeLoja: string
  emailLojista: string | null
  motivoLabel: string
}): Promise<void> {
  const subject = `Vyria — Pedido de cancelamento de assinatura — ${input.nomeLoja}`
  const html = `
    <p><strong>Solicitação de cancelamento</strong> (painel do lojista)</p>
    <ul>
      <li><strong>Loja:</strong> ${escapeHtml(input.nomeLoja)}</li>
      <li><strong>Email:</strong> ${escapeHtml(input.emailLojista || '—')}</li>
      <li><strong>Motivo:</strong> ${escapeHtml(input.motivoLabel)}</li>
    </ul>
  `
  await sendResendEmail({ subject, html })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
