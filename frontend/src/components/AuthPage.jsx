import Logo from './Logo'

export default function AuthPage({ children }) {
  return (
    <div className="min-h-dvh flex flex-col items-center relative overflow-hidden">
      {/* Logo */}
      <div className="relative z-10 pt-20 pb-7 flex flex-col items-center">
        <Logo size={64} />
      </div>

      {/* Form card */}
      <div className="relative z-10 w-full max-w-sm px-6 pb-16">
        <div className="pixel-card px-6 py-8">
          {children}
        </div>
      </div>
    </div>
  )
}
