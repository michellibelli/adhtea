import Logo from './Logo'

// Auth shell — cozy-cafe pass (2026-05-25). Replaces the old lavender /
// pride floating-emoji treatment with the same Solarized paper background
// the rest of the app uses: the fixed .aria-page-bg layer (bookshelf +
// linen grain + warm window vignette) plus a single lifted paper-card
// form. Inline <Logo /> SVG instead of the legacy purple PNG.
export default function AuthPage({ children }) {
  return (
    <div className="min-h-dvh flex flex-col items-center relative overflow-hidden">
      {/* Same fixed paper/bookshelf background as the rest of the app. */}
      <div className="aria-page-bg" aria-hidden="true" />

      {/* Logo */}
      <div className="relative z-10 pt-20 pb-7 flex flex-col items-center">
        <Logo size={64} />
      </div>

      {/* Form card — lifted paper, matches in-app cards. */}
      <div className="relative z-10 w-full max-w-sm px-6 pb-16">
        <div className="pixel-card px-6 py-8">
          {children}
        </div>
      </div>
    </div>
  )
}
