'use client'

export function StoreOpenSwitch({
  open,
  disabled,
  onToggle,
}: {
  open: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={open}
      aria-label={open ? 'Loja aberta' : 'Loja fechada'}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-primary)]/35 disabled:opacity-50 ${
        open ? 'bg-[var(--dash-primary)]' : 'bg-[#d1d5db]'
      }`}
    >
      <span
        className={`pointer-events-none absolute top-1 left-1 block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
          open ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
