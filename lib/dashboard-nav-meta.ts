import type { DashboardMenuKey } from '@/lib/dashboard-menu-types'

/** Metadados do menu (sem ícones) — fonte única para servidor e cliente. */
export type DashboardNavMetaItem = {
  href: string
  label: string
  menuKey: DashboardMenuKey
  quiet?: boolean
  administrationOnly?: boolean
  section?: string
}

export const DASHBOARD_NAV_META: DashboardNavMetaItem[] = [
  { href: '/dashboard/visao', label: 'Visão geral', menuKey: 'dashboard' },
  { href: '/dashboard/menu', label: 'Produtos', menuKey: 'produtos' },
  { href: '/dashboard/orders', label: 'Pedidos', menuKey: 'pedidos' },
  { href: '/dashboard/entregadores', label: 'Entregadores', menuKey: 'entregadores' },
  { href: '/dashboard/garcom', label: 'Salão / Mesas', menuKey: 'garcom' },
  {
    href: '/dashboard/garcons',
    label: 'Meus garçons',
    menuKey: 'garcons',
    administrationOnly: true,
  },
  { href: '/dashboard/pdv', label: 'PDV', menuKey: 'pdv' },
  { href: '/dashboard/kds', label: 'KDS', menuKey: 'kds' },
  { href: '/dashboard/caixa', label: 'Caixa', menuKey: 'caixa' },
  { href: '/dashboard/promotions', label: 'Promoções', menuKey: 'promocoes' },
  { href: '/dashboard/reports', label: 'Relatórios', menuKey: 'relatorios' },
  { href: '/dashboard/settings', label: 'Configurações', menuKey: 'configuracoes' },
  { href: '/dashboard/fiscal', label: 'Vyria Fiscal', menuKey: 'fiscal' },
  {
    href: '/dashboard/indique',
    label: 'Indique e ganhe',
    menuKey: 'indique',
    quiet: true,
  },
  { href: '/dashboard/appearance', label: 'Aparência', menuKey: 'aparencia' },
  { href: '/dashboard/automations', label: 'Automações', menuKey: 'automacoes' },
  { href: '/dashboard/printing', label: 'Impressão', menuKey: 'impressao' },
  {
    href: '/dashboard/balanca',
    label: 'Balança',
    menuKey: 'balanca',
    administrationOnly: true,
  },
  {
    href: '/dashboard/master/whatsapp',
    label: 'WhatsApp & robô',
    menuKey: 'master_whatsapp',
    administrationOnly: true,
    section: 'Master',
  },
  {
    href: '/dashboard/master/fidelidade',
    label: 'Fidelidade',
    menuKey: 'master_fidelidade',
    administrationOnly: true,
    section: 'Master',
  },
  {
    href: '/dashboard/master/marketing',
    label: 'Marketing',
    menuKey: 'master_marketing',
    administrationOnly: true,
    section: 'Master',
  },
  {
    href: '/dashboard/assinatura',
    label: 'Assinatura',
    menuKey: 'assinatura',
    quiet: true,
  },
]
