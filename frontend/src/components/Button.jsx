// Button primitive — all button styles go through here.
// Variants:
//   primary  — filled lavender with 4px pixel offset shadow (default)
//   secondary — 4px outlined
//   ghost    — no border, subtle hover
//   danger   — 4px red border

const BASE = `
  inline-flex items-center justify-center gap-2
  font-medium rounded-sm
  active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none
  cursor-pointer select-none
`

const SIZES = {
  sm:  'px-3 py-1.5 text-xs',
  md:  'px-4 py-2.5 text-sm',
  lg:  'px-5 py-3.5 text-sm w-full justify-center',
}

const VARIANTS = {
  primary:   'bg-ui-primary hover:bg-ui-primary-hover text-ui-primary-text pixel-btn',
  secondary: 'border-4 border-ui-border text-ui-subtext hover:text-ui-accent hover:border-ui-accent/60 transition-colors duration-150 bg-ui-surface',
  ghost:     'text-ui-subtext hover:text-ui-accent transition-colors duration-150',
  danger:    'border-4 border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors duration-150',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
