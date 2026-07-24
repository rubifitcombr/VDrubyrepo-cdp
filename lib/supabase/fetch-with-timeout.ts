const DEFAULT_MS = 12_000

/**
 * Fetch com timeout — evita páginas presas em «A carregar…» quando o Postgres/PostgREST demora.
 */
export function createFetchWithTimeout(timeoutMs = DEFAULT_MS): typeof fetch {
  return (input, init) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const userSignal = init?.signal
    if (userSignal) {
      if (userSignal.aborted) {
        clearTimeout(timer)
        controller.abort(userSignal.reason)
      } else {
        userSignal.addEventListener(
          'abort',
          () => controller.abort(userSignal.reason),
          { once: true }
        )
      }
    }

    return fetch(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timer)
    })
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = DEFAULT_MS,
  label = 'operação'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} excedeu ${timeoutMs}ms`)),
          timeoutMs
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
