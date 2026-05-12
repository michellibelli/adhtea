const NAV_ITEMS = [
  { id: 'today',    label: 'Today' },
  { id: 'triage',   label: 'Triage' },
  { id: 'inbox',    label: 'Inbox' },
  { id: 'routines', label: 'Routines' },
  { id: 'selfcare', label: 'Self Care' },
  { id: 'settings', label: 'Settings' },
]

export default function HamburgerMenu({ onNavigate, onClose, onLogout, user }) {
  function go(id) {
    onNavigate(id)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div className="fixed top-0 left-0 bottom-0 z-50 w-64 bg-ui-nav border-r border-ui-nav-border flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-ui-nav-border">
          <span className="text-sm font-semibold text-ui-text">{user?.name ?? ''}</span>
          <button
            onClick={onClose}
            className="text-ui-subtext hover:text-ui-text transition-colors p-1"
            aria-label="Close menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 flex flex-col py-4 gap-1 px-3">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className="text-left w-full px-4 py-3 rounded-sm text-sm font-medium text-ui-text hover:bg-ui-accent/10 hover:text-ui-accent transition-colors"
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sign out */}
        <div className="px-3 pb-8 border-t border-ui-nav-border pt-4">
          <button
            onClick={onLogout}
            className="w-full text-left px-4 py-3 rounded-sm text-sm text-ui-subtext hover:text-ui-text transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}
