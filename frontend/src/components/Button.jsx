const BASE = `
  inline-flex items-center justify-center gap-2
  font-semibold rounded-xl
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
  secondary: 'border border-ui-border/60 bg-white/70 text-ui-subtext hover:text-ui-accent hover:border-ui-accent/60 transition-colors duration-150',
  ghost:     'text-ui-subtext hover:text-ui-accent transition-colors duration-150',
  danger:    'border border-red-400/40 bg-white/60 text-red-400 hover:bg-red-500/10 transition-colors duration-150',
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
