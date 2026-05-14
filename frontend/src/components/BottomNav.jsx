const S = '#4A3FA8'  // deep periwinkle — icon stroke color

const anim = (name, dur, delay = '0s', extra = '') =>
  `${name} ${dur} ease-in-out infinite ${delay} ${extra}`.trim()

const svgG = (animName, dur, delay, origin = 'center') => ({
  style: {
    animation: anim(animName, dur, delay),
    transformBox: 'fill-box',
    transformOrigin: origin,
  }
})

const TeacupIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{width:40,height:40}}>
    <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
    <g {...svgG('nav-steam', '2.2s', '0s', 'center bottom')}>
      <line x1="6"  y1="2" x2="6"  y2="5"/>
      <line x1="10" y1="2" x2="10" y2="5"/>
      <line x1="14" y1="2" x2="14" y2="5"/>
    </g>
  </svg>
)

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" style={{width:40,height:40}}>
    <circle cx="12" cy="12" r="5"/>
    <g {...svgG('nav-ray-sway', '9s', '0s', 'center')}>
      <line x1="12" y1="1"    x2="12" y2="3"/>
      <line x1="12" y1="21"   x2="12" y2="23"/>
      <line x1="1"  y1="12"   x2="3"  y2="12"/>
      <line x1="21" y1="12"   x2="23" y2="12"/>
      <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>
      <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
    </g>
  </svg>
)

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{width:29,height:29}}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    <circle cx="19" cy="5" r="1.5" fill={S} stroke="none"
      style={{ animation: anim('nav-star-twinkle', '2.7s', '0s'), transformBox: 'fill-box', transformOrigin: 'center' }}
    />
    <circle cx="22" cy="10" r="1.2" fill={S} stroke="none"
      style={{ animation: anim('nav-star-twinkle', '2.7s', '1.0s'), transformBox: 'fill-box', transformOrigin: 'center' }}
    />
    <circle cx="5" cy="18" r="1.1" fill={S} stroke="none"
      style={{ animation: anim('nav-star-twinkle', '2.7s', '1.8s'), transformBox: 'fill-box', transformOrigin: 'center' }}
    />
  </svg>
)

const HeartSparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    style={{width:29,height:29, animation: anim('nav-heartbeat', '4.5s', '0s'), transformBox: 'fill-box', transformOrigin: 'center'}}
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    <line x1="12" y1="10" x2="12" y2="14" strokeWidth={1.5} opacity="0.8"/>
    <line x1="10" y1="12" x2="14" y2="12" strokeWidth={1.5} opacity="0.8"/>
  </svg>
)

const FlowerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    style={{width:35,height:35, animation: 'nav-flower-spin 7.5s linear infinite', transformBox: 'fill-box', transformOrigin: 'center'}}
  >
    <ellipse cx="12" cy="7"  rx="2.5" ry="3.5"/>
    <ellipse cx="17" cy="12" rx="3.5" ry="2.5"/>
    <ellipse cx="12" cy="17" rx="2.5" ry="3.5"/>
    <ellipse cx="7"  cy="12" rx="3.5" ry="2.5"/>
    <circle  cx="12" cy="12" r="2.5" fill={S} fillOpacity="0.3" stroke={S}/>
  </svg>
)

const SproutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{width:40,height:40}}>
    <path d="M12 22v-9"/>
    <path
      d="M12 13C12 13 7 10 7 5c0 0 3.5 0 5 3.5C13.5 5 17 5 17 5c0 5-5 8-5 8z"
      style={{ animation: anim('nav-leaf-sway', '4.2s', '0s'), transformBox: 'fill-box', transformOrigin: 'center bottom' }}
    />
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

const MOBILE_BOTTOM_ITEMS = [
  { id: 'focus',    label: 'Now',      icon: <TeacupIcon /> },
  { id: 'today',    label: 'Today',    icon: <SunIcon /> },
  { id: 'routines', label: 'Routines', icon: <MoonIcon /> },
  { id: 'selfcare', label: 'Log',      icon: <HeartSparkleIcon /> },
  { id: 'settings', label: 'Menu',     icon: <FlowerIcon /> },
]

export default function BottomNav({ active, onNavigate, onCapture }) {
  return (
    <>
      {/* Mobile bottom nav bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden flex items-stretch"
        style={{ background: '#2A0E58', borderTop: '4px solid #6A3090', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {MOBILE_BOTTOM_ITEMS.map(({ id, label, icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-opacity"
              style={{ opacity: isActive ? 1 : 0.45 }}
            >
              <span style={{ display: 'flex', transform: 'scale(0.65)', transformOrigin: 'center' }}>{icon}</span>
              <span className="text-[9px] font-semibold" style={{ color: '#fff' }}>{label}</span>
            </button>
          )
        })}
      </nav>

      {/* Mobile FAB — capture, floats above bottom nav */}
      <button
        onClick={onCapture}
        className="fixed bottom-[76px] right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-[#2A0F40] active:scale-95 transition-transform md:hidden pixel-btn"
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
            >
              <span style={{ opacity: isActive ? 1 : 0.5, transition: 'opacity 150ms' }}>
                {item.icon}
              </span>
              <span className="text-[11px]" style={{color:'#FFFFFF', fontWeight: isActive ? 700 : 600, textShadow: '0 1px 3px rgba(0,0,0,0.3)'}}>
                {item.label}
              </span>
            </button>
          )
        })}

        {/* Sparkle footer */}
        <div className="mt-auto flex flex-col items-center gap-1">
          <span className="sparkle text-xs" style={{color:'#4A3FA8', animationDelay:'1.4s'}}>✧</span>
        </div>
      </nav>
    </>
  )
}
