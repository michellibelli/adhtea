// Card primitive — all card/panel surfaces go through here.
// To restyle cards app-wide, edit this file only.
//
// Variants:
//   default  — standard card (bg + border + rounded)
//   flat     — border only, no background fill
//   ghost    — dashed border, used for empty queue indicators

const VARIANTS = {
  default: 'bg-ui-surface border border-ui-border backdrop-blur-sm',
  flat:    'border border-ui-border',
  ghost:   'border border-dashed border-ui-border',
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
