export type BlogPost = {
  slug: string
  title: string
  date: string
  excerpt: string
  paragraphs: string[]
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'bem-vindo-vyria-delivery',
    title: 'Bem-vindo à Vyria Delivery',
    date: '2026-04-01',
    excerpt:
      'Como funciona o painel, o cardápio público e o contacto com clientes pelo WhatsApp.',
    paragraphs: [
      'A Vyria Delivery junta o painel do lojista, o menu online com a tua marca e um fluxo pensado para pedidos e comunicação com o cliente.',
      'Depois de criares conta, configura produtos, horário e taxas de entrega. O teu cardápio fica disponível num endereço público com o slug da loja.',
      'Dúvidas ou suporte: usa os contactos indicados na área de assinatura ou fala connosco pelo WhatsApp de suporte.',
    ],
  },
  {
    slug: 'dicas-cardapio-online',
    title: 'Dicas para um cardápio online que vende',
    date: '2026-04-10',
    excerpt:
      'Fotos claras, categorias simples e preços visíveis ajudam a converter visitas em pedidos.',
    paragraphs: [
      'Organiza o menu por categorias curtas. Evita dezenas de itens na mesma lista sem divisão.',
      'Usa nomes de pratos que o cliente reconheça e descreve ingredientes principais quando fizer sentido.',
      'Mantém preços e disponibilidade atualizados no painel para evitar frustração no WhatsApp.',
    ],
  },
]

const bySlug = new Map(BLOG_POSTS.map((p) => [p.slug, p]))

export function getBlogPost(slug: string): BlogPost | undefined {
  return bySlug.get(slug)
}
