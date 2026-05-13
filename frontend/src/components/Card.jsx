// Card primitive — all card/panel surfaces go through here.
// Variants:
//   default  — cream surface with 4px pixel border + offset shadow
//   flat     — 4px border only, no fill
//   ghost    — 4px dashed border, empty queue indicators

const VARIANTS = {
  default: 'bg-ui-surface pixel-card',
  flat:    'border-4 border-ui-border',
  ghost:   'border-4 border-dashed border-ui-border',
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
      className={`rounded-sm ${VARIANTS[variant]} ${className} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  )
}
