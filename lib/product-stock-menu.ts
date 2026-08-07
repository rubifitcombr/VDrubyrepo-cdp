/** Produto com linha em store_product_stock (controlado). */
export function isStockControlled(stockQuantity: number | undefined): boolean {
  return stockQuantity !== undefined
}

/** Mesma regra do Garçom: controlado e quantity <= 0 → esgotado no cardápio. */
export function isMenuProductOutOfStock(stockQuantity: number | undefined): boolean {
  return stockQuantity !== undefined && stockQuantity <= 0
}
