export type StorefrontMenuProduct = {
  id: string
  name: string
  description: string | null
  category: string
  imageUrl: string | null
  price: number
  originalPrice: number | null
  popular: boolean
}
