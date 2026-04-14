export function DashboardPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse xl:max-w-7xl">
      <div>
        <div className="h-8 w-40 rounded-lg bg-vyria-navy/10 md:h-9" />
        <div className="mt-2 h-4 w-72 max-w-full rounded bg-vyria-navy/10" />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-3 w-24 rounded bg-vyria-navy/10" />
                <div className="h-8 w-16 rounded bg-vyria-navy/15" />
                <div className="h-3 w-32 rounded bg-vyria-navy/10" />
              </div>
              <div className="h-11 w-11 shrink-0 rounded-xl bg-vyria-navy/10" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--card-border)] bg-white shadow-sm lg:col-span-2">
          <div className="border-b border-[var(--card-border)] px-5 py-4">
            <div className="h-4 w-36 rounded bg-vyria-navy/10" />
            <div className="mt-2 h-3 w-56 rounded bg-vyria-navy/10" />
          </div>
          <div className="space-y-3 px-5 py-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-10 flex-1 rounded-xl bg-vyria-navy/10" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
          <div className="h-4 w-28 rounded bg-vyria-navy/10" />
          <div className="mt-2 h-3 w-24 rounded bg-vyria-navy/10" />
          <div className="mt-4 flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-vyria-navy/10" />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-dashed border-vyria-navy/15 bg-[#f9f9f9] p-6">
        <div className="h-3 w-20 rounded bg-vyria-navy/10" />
        <div className="mt-3 h-6 w-48 rounded bg-vyria-navy/15" />
        <div className="mt-3 h-4 w-full max-w-md rounded bg-vyria-navy/10" />
      </div>
    </div>
  )
}
