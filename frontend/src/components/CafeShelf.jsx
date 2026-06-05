const C = 'var(--aria-text)'

const ITEMS = [
  {
    id: 'projects',
    label: 'Projects',
    animation: 'shelf-leaf-sway 9s ease-in-out infinite',
    origin: 'center bottom',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke={C} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22v-9" />
        <path d="M12 13C12 13 7 10 7 5c0 0 3.5 0 5 3.5C13.5 5 17 5 17 5c0 5-5 8-5 8z" />
      </svg>
    ),
  },
  {
    id: 'routines',
    label: 'Routines',
    animation: 'none',
    origin: 'center',
    icon: (
      <svg viewBox="0 0 28 24" fill="none" stroke={C} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        <circle cx="19" cy="5" r="1.3" fill={C} stroke="none" />
        <circle cx="22" cy="10" r="1" fill={C} stroke="none" />
        <g className="shelf-cloud">
          <ellipse cx="6" cy="13" rx="4" ry="2.5" fill="var(--aria-surface, #FBF6E5)" stroke="none" />
          <ellipse cx="10" cy="12.5" rx="3.5" ry="2.8" fill="var(--aria-surface, #FBF6E5)" stroke="none" />
          <ellipse cx="14" cy="13.2" rx="3" ry="2.2" fill="var(--aria-surface, #FBF6E5)" stroke="none" />
        </g>
      </svg>
    ),
  },
  {
    id: 'selfcare',
    label: 'Log',
    animation: 'shelf-heartbeat 8s ease-in-out infinite',
    origin: 'center',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke={C} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        <line x1="12" y1="10" x2="12" y2="14" strokeWidth={1.4} opacity="0.7" />
        <line x1="10" y1="12" x2="14" y2="12" strokeWidth={1.4} opacity="0.7" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    animation: 'shelf-flower-spin 15s linear infinite',
    origin: 'center',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke={C} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="7" rx="2.5" ry="3.5" />
        <ellipse cx="17" cy="12" rx="3.5" ry="2.5" />
        <ellipse cx="12" cy="17" rx="2.5" ry="3.5" />
        <ellipse cx="7" cy="12" rx="3.5" ry="2.5" />
        <circle cx="12" cy="12" r="2.5" fill={C} fillOpacity="0.2" stroke={C} />
      </svg>
    ),
  },
]

export default function CafeShelf({ onNavigate }) {
  return (
    <div className="cafe-shelf">
      {/* Wooden shelf line */}
      <div className="cafe-shelf-line" />

      <div className="cafe-shelf-items">
        {ITEMS.map(({ id, label, icon, animation, origin }, i) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className="cafe-shelf-item"
            aria-label={label}
            style={{ animationDelay: `${i * -1.7}s` }}
          >
            <span
              className="cafe-shelf-icon"
              style={{
                animation,
                animationDelay: `${i * -2.3}s`,
                transformOrigin: origin,
              }}
            >
              {icon}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
