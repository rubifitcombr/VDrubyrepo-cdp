'use client'

import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

type Ctx = {
  /** Para `router.push` / navegação programática (ex.: após login). */
  beginNavigation: () => void
}

const NavigationProgressContext = createContext<Ctx | null>(null)

export function useBeginNavigation() {
  const ctx = useContext(NavigationProgressContext)
  return ctx?.beginNavigation ?? (() => {})
}

function sameAsCurrentLocation(url: URL) {
  const curPath = window.location.pathname
  const raw = window.location.search
  const curSearch = raw.startsWith('?') ? raw.slice(1) : ''
  const nextSearch = url.search.startsWith('?') ? url.search.slice(1) : url.search
  return url.pathname === curPath && nextSearch === curSearch
}

function RouteCompleteTracker({
  onRouteComplete,
}: {
  onRouteComplete: () => void
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const key = `${pathname}?${searchParams.toString()}`
  const prevKey = useRef<string | null>(null)

  useEffect(() => {
    if (prevKey.current === null) {
      prevKey.current = key
      return
    }
    if (prevKey.current === key) return
    prevKey.current = key
    onRouteComplete()
  }, [key, onRouteComplete])

  return null
}

export function NavigationProgressProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [pct, setPct] = useState(0)
  const activeRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const failSafeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t)
    timersRef.current = []
    if (failSafeRef.current) {
      clearTimeout(failSafeRef.current)
      failSafeRef.current = null
    }
  }, [])

  const finish = useCallback(() => {
    if (!activeRef.current) return
    clearTimers()
    activeRef.current = false
    setPct(100)
    setTimeout(() => {
      setPct(0)
    }, 280)
  }, [clearTimers])

  const begin = useCallback(() => {
    clearTimers()
    activeRef.current = true
    setPct(12)
    timersRef.current = [
      setTimeout(() => setPct(38), 90),
      setTimeout(() => setPct(62), 320),
      setTimeout(() => setPct(82), 720),
    ]
    failSafeRef.current = setTimeout(() => {
      finish()
    }, 12_000)
  }, [clearTimers, finish])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const el = (e.target as Element | null)?.closest('a[href]')
      if (!el) return
      const a = el as HTMLAnchorElement
      if (a.hasAttribute('download')) return
      const target = a.getAttribute('target')
      if (target && target !== '_self') return
      const href = a.getAttribute('href')
      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('javascript:')
      ) {
        return
      }
      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (sameAsCurrentLocation(url)) return
      begin()
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [begin])

  useEffect(() => {
    const onPop = () => begin()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [begin])

  const ctxValue: Ctx = { beginNavigation: begin }

  const showBar = pct > 0

  return (
    <NavigationProgressContext.Provider value={ctxValue}>
      <div
        className="pointer-events-none fixed left-0 right-0 top-0 z-[2147483000] h-[3px] overflow-hidden"
        aria-hidden
      >
        <div
          className="h-full bg-gradient-to-r from-vyria-plum via-vyria-orange to-vyria-gold shadow-[0_1px_8px_rgba(128,27,77,0.35)] transition-[width] duration-200 ease-out"
          style={{
            width: `${pct}%`,
            opacity: showBar ? 1 : 0,
            transitionProperty: 'width, opacity',
          }}
        />
      </div>
      <Suspense fallback={null}>
        <RouteCompleteTracker onRouteComplete={finish} />
      </Suspense>
      {children}
    </NavigationProgressContext.Provider>
  )
}
