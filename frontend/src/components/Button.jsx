// Button primitive — all button styles go through here.
// To restyle buttons app-wide, edit this file only.
//
// Variants:
//   primary  — filled, accent colour (default)
//   secondary — outlined, transparent fill
//   ghost    — no border, subtle hover
//   danger   — red tones for destructive actions

const BASE = `
  inline-flex items-center justify-center gap-2
  font-medium rounded-xl
  transition-all duration-150
  active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none
  cursor-pointer select-none
`

const SIZES = {
  sm:  'px-3 py-1.5 text-xs',
  md:  'px-4 py-2.5 text-sm',
  lg:  'px-5 py-3.5 text-sm w-full justify-center',
}

const VARIANTS = {
  primary:   'bg-ui-primary hover:bg-ui-primary-hover text-ui-primary-text',
  secondary: 'border border-ui-border text-ui-subtext hover:text-ui-accent hover:border-ui-accent/40',
  ghost:     'text-ui-subtext hover:text-ui-accent',
  danger:    'border border-red-500/30 text-red-400 hover:bg-red-500/10',
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
