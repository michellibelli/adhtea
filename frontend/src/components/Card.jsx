const VARIANTS = {
  default: 'bg-ui-surface pixel-card',
  flat:    'border border-ui-border/40 bg-white/80',
  ghost:   'border border-dashed border-ui-border/50',
}

export default function Card({
  variant = 'default',
  className = '',
  children,
  onClick,
  ...props
}) {
  return (
    <div
      className={`rounded-2xl ${VARIANTS[variant]} ${className} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  )
}
