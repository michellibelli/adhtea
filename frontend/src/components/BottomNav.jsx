const S = '#7B72CC'  // "adh" periwinkle from logo

const TeacupIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
    <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
    <line x1="6" y1="2" x2="6" y2="5"/>
    <line x1="10" y1="2" x2="10" y2="5"/>
    <line x1="14" y1="2" x2="14" y2="5"/>
  </svg>
)

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" className="w-8 h-8">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1"    x2="12" y2="3"/>
    <line x1="12" y1="21"   x2="12" y2="23"/>
    <line x1="1"  y1="12"   x2="3"  y2="12"/>
    <line x1="21" y1="12"   x2="23" y2="12"/>
    <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>
    <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
  </svg>
)

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    <circle cx="18" cy="6" r="0.8" fill={S} stroke="none"/>
    <circle cx="21" cy="9" r="0.6" fill={S} stroke="none"/>
  </svg>
)

const HeartSparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    <line x1="12" y1="10" x2="12" y2="14" strokeWidth={1.5} opacity="0.8"/>
    <line x1="10" y1="12" x2="14" y2="12" strokeWidth={1.5} opacity="0.8"/>
  </svg>
)

const FlowerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <ellipse cx="12" cy="7"  rx="2.5" ry="3.5"/>
    <ellipse cx="17" cy="12" rx="3.5" ry="2.5"/>
    <ellipse cx="12" cy="17" rx="2.5" ry="3.5"/>
    <ellipse cx="7"  cy="12" rx="3.5" ry="2.5"/>
    <circle  cx="12" cy="12" r="2.5" fill={S} fillOpacity="0.3" stroke={S}/>
  </svg>
)

const SproutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M12 22v-9"/>
    <path d="M12 13C12 13 7 10 7 5c0 0 3.5 0 5 3.5C13.5 5 17 5 17 5c0 5-5 8-5 8z"/>
  </svg>
)

const MOBILE_NAV_ITEMS = [
  { id: 'projects', label: 'Projects', icon: <SproutIcon /> },
  { id: 'routines', label: 'Routines', icon: <MoonIcon /> },
  { id: 'selfcare', label: 'Log',      icon: <HeartSparkleIcon /> },
  { id: 'settings', label: 'Menu',     icon: <FlowerIcon /> },
]

const DESKTOP_NAV_ITEMS = [
  { id: 'capture',  label: 'Capture',  icon: <TeacupIcon /> },
  { id: 'today',    label: 'Today',    icon: <SunIcon /> },
  ...MOBILE_NAV_ITEMS,
]

export default function BottomNav({ active, onNavigate, onCapture }) {
  return (
    <>
      {/* Mobile FAB — capture */}
      <button
        onClick={onCapture}
        className="fixed bottom-6 right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-[#2A0F40] active:scale-95 transition-transform md:hidden pixel-btn"
        style={{ background: 'linear-gradient(135deg, #C490D1, #B4A8E0)' }}
        aria-label="Capture"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
          <line x1="6" y1="2" x2="6" y2="5"/>
          <line x1="10" y1="2" x2="10" y2="5"/>
          <line x1="14" y1="2" x2="14" y2="5"/>
        </svg>
      </button>

      {/* Desktop sidebar */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 z-50 w-20 flex-col items-center border-r-4 border-[#B05CC0] bg-[#CC7FDF] pt-6 pb-6 gap-1">

        {/* Pride stripe top */}
        <div className="pride-stripe absolute top-0 left-0 right-0" style={{height:'4px'}} />

        {/* Logo — home button */}
        <button onClick={() => onNavigate('focus')} className="mb-4 mt-1 hover:opacity-80 transition-opacity" aria-label="Go to Now">
          <img src="/adhTeaLogo.png" alt="adhTea" className="object-contain rounded-xl" style={{width:'64px'}}/>
        </button>

        {DESKTOP_NAV_ITEMS.map((item) => {
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              onClick={() => item.id === 'capture' ? onCapture() : onNavigate(item.id)}
              className="w-full flex flex-col items-center justify-center gap-1 py-3 px-2 transition-all duration-150"
              style={{ opacity: isActive ? 1 : 0.45 }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.opacity = '0.75' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.opacity = '0.45' }}
            >
              {item.icon}
              <span className="text-[9px] font-medium text-white">
                {item.label}
              </span>
            </button>
          )
        })}

        {/* Sparkle footer */}
        <div className="mt-auto flex flex-col items-center gap-1">
          <span className="sparkle text-xs" style={{color:'#7B72CC', animationDelay:'1.4s'}}>✧</span>
        </div>
      </nav>
    </>
  )
}
