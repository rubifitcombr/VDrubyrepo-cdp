'use client'

import Image from 'next/image'
import { useState } from 'react'
import {
  isNextImageOptimizableUrl,
  resolveMenuImageUrl,
} from '@/lib/menu-image-url'

type MenuImageProps = {
  src: string | null | undefined
  alt: string
  className?: string
  fill?: boolean
  width?: number
  height?: number
  sizes?: string
  priority?: boolean
  loading?: 'lazy' | 'eager'
  fallback?: React.ReactNode
  storeId?: string | null
  unoptimized?: boolean
}

export function MenuImage({
  src,
  alt,
  className = 'object-cover',
  fill,
  width,
  height,
  sizes,
  priority,
  loading = 'lazy',
  fallback = null,
  storeId,
  unoptimized = false,
}: MenuImageProps) {
  const resolved = resolveMenuImageUrl(src, storeId)
  const [failed, setFailed] = useState(false)
  const [useNative, setUseNative] = useState(
    () =>
      unoptimized ||
      (resolved != null && !isNextImageOptimizableUrl(resolved))
  )

  if (!resolved || failed) return fallback ? <>{fallback}</> : null

  if (useNative || !isNextImageOptimizableUrl(resolved)) {
    const fillStyle = fill
      ? ({
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        } as const)
      : undefined

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt={alt}
        className={className}
        style={fillStyle}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        loading={priority ? 'eager' : loading}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <Image
      src={resolved}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      className={className}
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : loading}
      onError={() => setUseNative(true)}
    />
  )
}
