/** Opções do menu interactivo WhatsApp (List Message). */

export type WhatsAppMenuOptionId =
  | 'status_pedido'
  | 'meus_pontos'
  | 'horario'
  | 'taxa_entrega'
  | 'falar_atendente'

export type WhatsAppListRow = {
  id: WhatsAppMenuOptionId
  title: string
  description?: string
}

export const WHATSAPP_HELP_MENU_TITLE = 'Como posso ajudar?'

export const WHATSAPP_HELP_MENU_BUTTON = 'Ver opções'

export const WHATSAPP_MENU_HINT =
  'Digite *menu* a qualquer momento pra ver as opções novamente.'

export const WHATSAPP_HELP_MENU_ROWS: WhatsAppListRow[] = [
  {
    id: 'status_pedido',
    title: '📦 Status do meu pedido',
    description: 'Acompanhe seu pedido mais recente',
  },
  {
    id: 'meus_pontos',
    title: '⭐ Meus pontos',
    description: 'Saldo do programa de fidelidade',
  },
  {
    id: 'horario',
    title: '🕒 Horário de funcionamento',
    description: 'Veja se estamos abertos agora',
  },
  {
    id: 'taxa_entrega',
    title: '🚚 Taxa de entrega',
    description: 'Valores e frete grátis',
  },
  {
    id: 'falar_atendente',
    title: '💬 Falar com atendente',
    description: 'Um humano continua o atendimento',
  },
]

export function isWhatsAppMenuOptionId(value: string): value is WhatsAppMenuOptionId {
  return (
    value === 'status_pedido' ||
    value === 'meus_pontos' ||
    value === 'horario' ||
    value === 'taxa_entrega' ||
    value === 'falar_atendente'
  )
}
