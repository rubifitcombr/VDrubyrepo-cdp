/** Mensagens amigáveis para erros do Supabase Auth (login, recuperação, etc.). */
export function authErrorMessagePt(
  message: string | undefined,
  fallback = 'Não foi possível iniciar sessão. Tenta novamente.'
): string {
  const raw = (message ?? '').trim()
  if (!raw) return fallback

  const lower = raw.toLowerCase()

  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid email or password')
  ) {
    return 'Email ou senha incorretos. Verifica os dados ou usa «Esqueci a senha».'
  }

  if (lower.includes('email not confirmed')) {
    return 'Confirma o teu email antes de entrar (verifica a caixa de entrada).'
  }

  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return 'Muitas tentativas seguidas. Aguarda um minuto e tenta de novo.'
  }

  if (lower.includes('user not found')) {
    return 'Não encontrámos conta com este email. Cria uma conta ou confirma o endereço.'
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Erro de ligação. Verifica a internet e tenta novamente.'
  }

  return raw
}
