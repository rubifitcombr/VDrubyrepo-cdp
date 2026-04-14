type InstanceResponse = {
  instanceName: string
  connectionState: string
  qrCode: string | null
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

export async function getWhatsAppInstanceStatus(
  storeId: string,
  includeQr: boolean = false
): Promise<InstanceResponse> {
  const params = new URLSearchParams({
    storeId,
    ...(includeQr ? { includeQr: '1' } : {}),
  })
  const res = await fetch(`/api/whatsapp/instance?${params.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await parseJson<InstanceResponse & { error?: string }>(res)
  if (!res.ok) throw new Error(data.error || 'Falha ao consultar instância.')
  return data
}

export async function connectWhatsAppInstance(
  storeId: string
): Promise<InstanceResponse> {
  const res = await fetch('/api/whatsapp/instance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, action: 'connect' }),
  })
  const data = await parseJson<InstanceResponse & { error?: string }>(res)
  if (!res.ok) throw new Error(data.error || 'Falha ao gerar QR Code.')
  return data
}
