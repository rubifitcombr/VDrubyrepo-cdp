const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function ReceiptPreview({
  storeName,
  includeCustomer,
  deliveryCopy,
  deliveryFee,
  paperMm = 80,
}: {
  storeName: string
  includeCustomer: boolean
  deliveryCopy: boolean
  deliveryFee: number
  paperMm?: 58 | 80
}) {
  const header = storeName.trim().toUpperCase() || 'A TUA LOJA'
  const subtotal = 63.8
  const total = subtotal + deliveryFee
  const widthClass = paperMm === 58 ? 'max-w-[200px]' : 'max-w-[280px]'

  return (
    <div
      className={`mx-auto ${widthClass} rounded-lg border border-vyria-navy/10 bg-[#ececec] p-4 shadow-inner`}
    >
      <div className="bg-white px-3 py-4 font-mono text-[11px] leading-relaxed text-vyria-navy shadow-sm">
        <p className="text-center font-bold tracking-wide">{header}</p>
        <p className="my-2 border-t border-dashed border-vyria-navy/30" />
        <p className="font-semibold">PEDIDO #001</p>
        <p className="mt-2">2x Smash Burger Clássico</p>
        <p>1x Coca Cola 350ml</p>
        <p className="my-2 border-t border-dashed border-vyria-navy/30" />
        <p>Subtotal: {money.format(subtotal)}</p>
        <p>Taxa entrega: {money.format(deliveryFee)}</p>
        <p className="mt-1 font-bold">TOTAL: {money.format(total)}</p>
        {includeCustomer ? (
          <>
            <p className="my-2 border-t border-dashed border-vyria-navy/30" />
            <p>Cliente: João Silva</p>
            <p>Tel: (11) 98765-4321</p>
            <p>Rua das Acácias, 456</p>
            <p>Pagamento: PIX</p>
          </>
        ) : null}
        {deliveryCopy ? (
          <>
            <p className="my-2 border-t border-dashed border-vyria-navy/30" />
            <p className="text-center font-bold uppercase">2ª via — entregador</p>
          </>
        ) : null}
      </div>
    </div>
  )
}
