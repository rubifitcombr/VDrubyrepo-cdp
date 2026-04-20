export const STORE_THEME_IDS = [
  'pizzaria',
  'acai',
  'hamburgueria',
  'jantinha',
  'japonesa',
  'doceria',
  'padaria',
  'padrao',
] as const

export type StoreThemeId = (typeof STORE_THEME_IDS)[number]

export type StoreTheme = {
  id: StoreThemeId
  label: string
  primary: string
  secondary: string
}

export const STORE_THEMES: readonly StoreTheme[] = [
  {
    id: 'pizzaria',
    label: 'Pizzaria',
    primary: '#E85D04',
    secondary: '#FBB02D',
  },
  {
    id: 'acai',
    label: 'Açaiteria',
    primary: '#5B2C83',
    secondary: '#D946EF',
  },
  {
    id: 'hamburgueria',
    label: 'Hamburgueria',
    primary: '#EA580C',
    secondary: '#DC2626',
  },
  {
    id: 'jantinha',
    label: 'Jantinha',
    primary: '#14532D',
    secondary: '#4ADE80',
  },
  {
    id: 'japonesa',
    label: 'Japonesa',
    primary: '#B91C1C',
    secondary: '#171717',
  },
  {
    id: 'doceria',
    label: 'Doceria',
    primary: '#EC4899',
    secondary: '#C084FC',
  },
  {
    id: 'padaria',
    label: 'Padaria',
    primary: '#CA8A04',
    secondary: '#92400E',
  },
  {
    id: 'padrao',
    label: 'Padrão',
    primary: '#F27121',
    secondary: '#FBB03B',
  },
] as const

const byId = new Map<StoreThemeId, StoreTheme>(
  STORE_THEMES.map((t) => [t.id, t])
)

export function resolveStoreTheme(
  preset: string | null | undefined
): StoreTheme {
  const key =
    typeof preset === 'string' && preset.trim()
      ? preset.trim().toLowerCase()
      : ''
  if (key && byId.has(key as StoreThemeId)) {
    return byId.get(key as StoreThemeId)!
  }
  return byId.get('padrao')!
}

export function isValidStoreThemeId(id: string): id is StoreThemeId {
  return STORE_THEME_IDS.includes(id as StoreThemeId)
}
