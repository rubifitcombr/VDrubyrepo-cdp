export type FbLoginResponse = {
  authResponse?: {
    code?: string
    accessToken?: string
  }
  status?: string
}

export type FacebookSdk = {
  init: (params: {
    appId: string
    cookie?: boolean
    xfbml?: boolean
    version: string
  }) => void
  login: (
    callback: (response: FbLoginResponse) => void,
    options?: Record<string, unknown>
  ) => void
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

export {}
