import { menuKeysForMerchant } from '@/lib/dashboard-menu'
import type { DashboardMenuKey } from '@/lib/dashboard-menu-types'
import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import { hasFeature, type Plan } from '@/lib/plan'

export type OperationalHubTileTone =
  | 'cyan'
  | 'green'
  | 'teal'
  | 'purple'
  | 'orange'
  | 'yellow'
  | 'slate'
  | 'blue'
  | 'pink'

export type OperationalHubTileIcon =
  | 'orders'
  | 'online'
  | 'drivers'
  | 'counter'
  | 'tables'
  | 'kds'
  | 'cashier'
  | 'stock'
  | 'reports'
  | 'products'
  | 'settings'
  | 'admin'
  | 'upgrade'

type TilePermission =
  | { type: 'menu'; key: DashboardMenuKey }
  | { type: 'inventory' }
  | { type: 'always' }
  | { type: 'upgrade-orders' }

type TileTemplate = {
  key: string
  label: string
  description: string
  href: string
  icon: OperationalHubTileIcon
  tone: OperationalHubTileTone
  permission: TilePermission
  external?: boolean
  emphasis?: boolean
}

export type OperationalHubTile = Omit<TileTemplate, 'permission'> & {
  locked?: boolean
  badge?: string
}

const BASE_TILES = {
  pedidos: {
    key: 'pedidos',
    label: 'Pedidos',
    description: 'Receber, confirmar e acompanhar pedidos em tempo real.',
    href: '/dashboard/orders',
    icon: 'orders',
    tone: 'cyan',
    permission: { type: 'menu', key: 'pedidos' },
    emphasis: true,
  },
  lojaOnline: {
    key: 'loja-online',
    label: 'Loja online',
    description: 'Abrir o cardápio público como o cliente vê.',
    href: '',
    icon: 'online',
    tone: 'green',
    permission: { type: 'always' },
    external: true,
    emphasis: true,
  },
  entregadores: {
    key: 'entregadores',
    label: 'Entregadores',
    description: 'Gerenciar entregadores, corridas e repasses.',
    href: '/dashboard/entregadores',
    icon: 'drivers',
    tone: 'teal',
    permission: { type: 'menu', key: 'entregadores' },
  },
  balcao: {
    key: 'balcao',
    label: 'Balcão / PDV',
    description: 'Registrar vendas rápidas e comandas presenciais.',
    href: '/dashboard/pdv',
    icon: 'counter',
    tone: 'green',
    permission: { type: 'menu', key: 'pdv' },
    emphasis: true,
  },
  salao: {
    key: 'salao-mesas',
    label: 'Salão / Mesas',
    description: 'Abrir mesas, lançar itens e atender pelo garçom.',
    href: '/dashboard/garcom',
    icon: 'tables',
    tone: 'purple',
    permission: { type: 'menu', key: 'garcom' },
    emphasis: true,
  },
  cozinha: {
    key: 'cozinha',
    label: 'Cozinha / KDS',
    description: 'Monitorar preparo, filas e pedidos prontos.',
    href: '/dashboard/kds',
    icon: 'kds',
    tone: 'orange',
    permission: { type: 'menu', key: 'kds' },
  },
  caixa: {
    key: 'caixa',
    label: 'Caixa',
    description: 'Abrir turno, lançar movimentações e fechar caixa.',
    href: '/dashboard/caixa',
    icon: 'cashier',
    tone: 'yellow',
    permission: { type: 'menu', key: 'caixa' },
  },
  estoque: {
    key: 'estoque',
    label: 'Estoque',
    description: 'Acompanhar níveis de estoque dos produtos.',
    href: '/dashboard/inventory',
    icon: 'stock',
    tone: 'slate',
    permission: { type: 'inventory' },
  },
  relatorios: {
    key: 'relatorios',
    label: 'Relatórios',
    description: 'Ver vendas, produtos e desempenho do período.',
    href: '/dashboard/reports',
    icon: 'reports',
    tone: 'blue',
    permission: { type: 'menu', key: 'relatorios' },
  },
  produtos: {
    key: 'produtos',
    label: 'Produtos / Cardápio',
    description: 'Editar itens, preços, fotos e disponibilidade.',
    href: '/dashboard/menu',
    icon: 'products',
    tone: 'pink',
    permission: { type: 'menu', key: 'produtos' },
  },
  entregaConfig: {
    key: 'configurar-entrega',
    label: 'Configurar entrega',
    description: 'Ajustar horário, raio, taxa e funcionamento da loja.',
    href: '/dashboard/settings',
    icon: 'settings',
    tone: 'slate',
    permission: { type: 'menu', key: 'configuracoes' },
  },
  configuracoes: {
    key: 'configuracoes',
    label: 'Configurações',
    description: 'Dados da loja, atendimento, pagamentos e preferências.',
    href: '/dashboard/settings',
    icon: 'settings',
    tone: 'slate',
    permission: { type: 'menu', key: 'configuracoes' },
  },
  upgradePedidos: {
    key: 'ativar-pedidos-online',
    label: 'Ativar pedidos online',
    description: 'Liberar o fluxo operacional de pedidos no teu plano.',
    href: '/planos',
    icon: 'upgrade',
    tone: 'orange',
    permission: { type: 'upgrade-orders' },
  },
  administracao: {
    key: 'administracao',
    label: 'Administração',
    description: 'Abrir visão geral, métricas e painel completo.',
    href: '/dashboard/visao?hub=administracao',
    icon: 'admin',
    tone: 'slate',
    permission: { type: 'always' },
  },
} satisfies Record<string, TileTemplate>

const TILES_BY_MODE: Record<MerchantOperationMode, TileTemplate[]> = {
  delivery: [
    BASE_TILES.pedidos,
    BASE_TILES.lojaOnline,
    BASE_TILES.entregadores,
    BASE_TILES.produtos,
    BASE_TILES.entregaConfig,
    BASE_TILES.cozinha,
    BASE_TILES.caixa,
    BASE_TILES.relatorios,
    BASE_TILES.upgradePedidos,
    BASE_TILES.administracao,
  ],
  presencial: [
    BASE_TILES.balcao,
    BASE_TILES.salao,
    BASE_TILES.pedidos,
    BASE_TILES.cozinha,
    BASE_TILES.caixa,
    BASE_TILES.produtos,
    BASE_TILES.relatorios,
    BASE_TILES.configuracoes,
    BASE_TILES.administracao,
  ],
  hibrido: [
    BASE_TILES.pedidos,
    BASE_TILES.balcao,
    BASE_TILES.salao,
    BASE_TILES.lojaOnline,
    BASE_TILES.entregadores,
    BASE_TILES.cozinha,
    BASE_TILES.caixa,
    BASE_TILES.estoque,
    BASE_TILES.produtos,
    BASE_TILES.entregaConfig,
    BASE_TILES.relatorios,
    BASE_TILES.upgradePedidos,
    BASE_TILES.administracao,
  ],
}

function canShowTile(
  template: TileTemplate,
  plan: Plan,
  operationMode: MerchantOperationMode | null,
  allowed: ReadonlySet<DashboardMenuKey>
): boolean {
  switch (template.permission.type) {
    case 'always':
      return true
    case 'menu':
      return allowed.has(template.permission.key)
    case 'inventory':
      return hasFeature(plan, 'inventory')
    case 'upgrade-orders':
      return (
        (operationMode === 'delivery' || operationMode === 'hibrido') &&
        !allowed.has('pedidos')
      )
    default:
      return false
  }
}

export function getOperationalHubTiles({
  plan,
  operationMode,
  storeSlug,
}: {
  plan: Plan
  operationMode: MerchantOperationMode | null
  storeSlug: string | null
}): OperationalHubTile[] {
  const effectiveMode = operationMode ?? 'hibrido'
  const allowed = menuKeysForMerchant(plan, operationMode)

  return TILES_BY_MODE[effectiveMode]
    .filter((tile) => canShowTile(tile, plan, operationMode, allowed))
    .map((template) => {
      const tile = {
        key: template.key,
        label: template.label,
        description: template.description,
        href: template.href,
        icon: template.icon,
        tone: template.tone,
        external: template.external,
        emphasis: template.emphasis,
      }
      if (tile.key !== 'loja-online') return tile
      if (storeSlug) return { ...tile, href: `/${storeSlug}` }
      return {
        ...tile,
        label: 'Configurar loja online',
        description: 'Completar dados da loja antes de abrir o cardápio.',
        href: '/dashboard/settings',
        external: false,
      }
    })
}
