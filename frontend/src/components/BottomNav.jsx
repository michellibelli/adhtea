const CAPTURE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
  </svg>
)

const MOBILE_NAV_ITEMS = [
  {
    id: 'routines',
    label: 'Routines',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    ),
  },
  {
    id: 'selfcare',
    label: 'Log',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: '',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    ),
  },
]

const DESKTOP_NAV_ITEMS = [
  {
    id: 'capture',
    label: 'Capture',
    icon: CAPTURE_ICON,
  },
  {
    id: 'today',
    label: 'Today',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  ...MOBILE_NAV_ITEMS,
]

export default function BottomNav({ active, onNavigate, onCapture }) {
  return (
    <>
      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t border-ui-nav-border bg-ui-nav backdrop-blur-md pb-safe md:hidden">
        {MOBILE_NAV_ITEMS.map((item) => {
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 px-1 min-h-[60px] transition-colors duration-150 ${isActive ? 'text-ui-accent' : 'text-ui-subtext'}`}
            >
              {item.icon}
              <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Mobile FAB — capture */}
      <button
        onClick={onCapture}
        className="fixed bottom-[76px] right-4 z-50 w-14 h-14 rounded-full bg-ui-accent shadow-lg flex items-center justify-center text-white active:scale-95 transition-transform md:hidden"
        aria-label="Capture"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-6 h-6">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Desktop sidebar */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 z-50 w-20 flex-col items-center border-r border-ui-nav-border bg-ui-nav backdrop-blur-md pt-6 pb-6 gap-2">
        <div className="text-xs font-bold tracking-widest mb-4 text-ui-accent">ARIA</div>
        {DESKTOP_NAV_ITEMS.map((item) => {
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              onClick={() => item.id === 'capture' ? onCapture() : onNavigate(item.id)}
              className={`w-full flex flex-col items-center justify-center gap-1 py-3 px-2 transition-colors duration-150 ${isActive ? 'text-ui-accent border-r-2 border-ui-accent/40' : 'text-ui-subtext'}`}
            >
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
