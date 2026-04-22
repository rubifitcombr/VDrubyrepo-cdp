import Link from 'next/link'
import { BrandLogo } from '@/app/_components/BrandLogo'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog | Vyria Delivery',
  description: 'Notas sobre produto, vendas locais e boas práticas para a tua loja online.',
}

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#f9f9f9]">
      <header className="shrink-0 border-b border-[var(--card-border)] bg-white/90 px-4 py-3 backdrop-blur-sm sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Link href="/" className="shrink-0" aria-label="Vyria Delivery — início">
            <BrandLogo width={140} priority className="max-h-8" />
          </Link>
          <nav className="flex items-center gap-4 text-sm font-semibold">
            <Link
              href="/blog"
              className="text-vyria-plum hover:text-vyria-orange"
            >
              Blog
            </Link>
            <Link
              href="/login"
              className="text-vyria-navy-muted hover:text-vyria-navy"
            >
              Entrar
            </Link>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-[var(--card-border)] bg-white/80 py-6 text-center text-sm text-vyria-navy-muted">
        <Link href="/" className="font-semibold text-vyria-plum hover:text-vyria-orange">
          ← Vyria Delivery
        </Link>
      </footer>
    </div>
  )
}
