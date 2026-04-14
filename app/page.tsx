import Link from 'next/link'
import { BrandLogo } from '@/app/_components/BrandLogo'

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#f9f9f9]">
      <header className="shrink-0 border-b border-[var(--card-border)] bg-white/90 px-4 py-3 backdrop-blur-sm sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 sm:gap-4">
          <BrandLogo width={150} priority className="max-h-9" />
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-semibold text-vyria-navy-muted hover:text-vyria-navy"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="btn-vyria-gradient rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Começar
            </Link>
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-12 sm:px-6 sm:py-16 md:py-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background: `
              radial-gradient(ellipse 70% 50% at 50% 0%, rgba(128, 27, 77, 0.08), transparent),
              radial-gradient(ellipse 50% 40% at 100% 60%, rgba(242, 113, 33, 0.06), transparent)
            `,
          }}
        />
        <div className="relative mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-vyria-plum">
            Engenharia de vendas local
          </p>
          <h1 className="font-brand mt-4 text-3xl font-bold tracking-tight text-vyria-navy sm:text-4xl md:text-5xl">
            A tua loja online, com a tua marca
          </h1>
          <p className="mt-5 text-base leading-relaxed text-vyria-navy-muted sm:mt-6 sm:text-lg">
            Cria a loja, gere produtos e liga o teu canal de vendas — do painel
            ao WhatsApp do cliente, num fluxo claro e profissional.
          </p>
          <div className="mt-8 flex w-full max-w-md flex-col items-stretch gap-3 sm:mt-10 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-4">
            <Link
              href="/register"
              className="btn-vyria-gradient inline-flex justify-center rounded-xl px-6 py-3.5 text-sm font-semibold sm:px-8"
            >
              Criar conta grátis
            </Link>
            <Link
              href="/login"
              className="inline-flex justify-center rounded-xl border-2 border-vyria-navy/15 bg-white px-6 py-3.5 text-sm font-semibold text-vyria-navy shadow-sm transition-colors hover:border-vyria-orange/30 hover:bg-[#f9f9f9] sm:px-8"
            >
              Já tenho conta
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
