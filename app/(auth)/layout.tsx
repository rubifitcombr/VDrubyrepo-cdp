import { BrandLogo } from '@/app/_components/BrandLogo'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-[#f0f2f5] px-4 py-8 sm:px-6 sm:py-12 md:py-16">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(128, 27, 77, 0.12), transparent),
            radial-gradient(ellipse 60% 40% at 100% 50%, rgba(242, 113, 33, 0.08), transparent),
            radial-gradient(ellipse 50% 30% at 0% 80%, rgba(251, 176, 59, 0.1), transparent)
          `,
        }}
      />
      <div className="relative mb-6 flex justify-center sm:mb-8">
        <div className="rounded-2xl bg-[#f9f9f9] px-4 py-3 shadow-lg shadow-vyria-navy-deep/10 ring-1 ring-black/5 sm:px-6 sm:py-4">
          <BrandLogo width={200} priority className="max-w-[min(100%,11rem)] sm:max-w-none" />
        </div>
      </div>
      <div className="relative w-full max-w-md pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
        {children}
      </div>
    </div>
  )
}
