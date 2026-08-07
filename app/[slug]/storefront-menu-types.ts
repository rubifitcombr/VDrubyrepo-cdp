export type StorefrontMenuProduct = {
  id: string
  name: string
  description: string | null
  category: string
  imageUrl: string | null
  price: number
  originalPrice: number | null
  popular: boolean
  /** true quando há linha de stock e quantity <= 0 */
  outOfStock: boolean
}
