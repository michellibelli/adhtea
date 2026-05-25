import { useState, useMemo } from 'react'
import { seedOnboarding } from '../api/auth'
import Logo from '../components/Logo'
import Button from '../components/Button'

function detectPlatform() {
  const ua = navigator.userAgent
  const isIOS     = /iPhone|iPad|iPod/.test(ua)
  const isAndroid = /Android/.test(ua)
  const isChrome  = /Chrome/.test(ua) && !/Edg/.test(ua)
  const isSafari  = /Safari/.test(ua) && !/Chrome/.test(ua)
  if (isIOS)                    return 'ios'
  if (isAndroid && isChrome)    return 'android'
  if (!isIOS && !isAndroid && isSafari)  return 'desktop-safari'
  if (!isIOS && !isAndroid && isChrome)  return 'desktop-chrome'
  return 'other'
}

const INSTALL_INSTRUCTIONS = {
  ios: {
    note: 'In Safari on iPhone or iPad:',
    bullets: [
      'Tap the Share button (⎙) at the bottom of the screen',
      'Scroll and tap "Add to Home Screen"',
      'Tap "Add" — done!',
    ],
  },
  android: {
    note: 'In Chrome on Android:',
    bullets: [
      'Tap the ⋮ menu in the top-right corner',
      'Tap "Add to Home Screen" or "Install app"',
      'Tap "Add" to confirm',
    ],
  },
  'desktop-chrome': {
    note: 'In Chrome on your computer:',
    bullets: [
      'Look for the ⊕ install icon at the right of the address bar',
      'Or click ⋮ → "Install adhTea…"',
      'Click "Install" to confirm',
    ],
  },
  'desktop-safari': {
    note: 'In Safari on Mac:',
    bullets: [
      'Click the Share button in the toolbar',
      'Choose "Add to Dock" (macOS Sonoma+)',
    ],
  },
  other: {
    note: 'Depending on your browser:',
    bullets: [
      'Chrome: click ⋮ → "Install" or "Add to Home Screen"',
      'Firefox: tap address bar → "Install"',
      'Safari (iOS): Share → "Add to Home Screen"',
    ],
  },
}

const STEPS = [
  {
    emoji: '☕',
    heading: 'Welcome to adhTea',
    body: "This is your cozy corner for getting things done without the overwhelm. No shame, no pressure — just gentle structure that works with your brain.",
  },
  {
    emoji: '📋',
    heading: "Here's what's waiting for you",
    body: "We've set up a few starter tasks to help you explore. You can tick off 'Log in ✓' right away, and work through the rest at your own pace.",
    bullets: [
      'A daily 15-min self-care routine to schedule',
      '"Spill the tea babe 🍵" — a project with two starter prompts',
      'A first morning check-in to log',
    ],
  },
  {
    emoji: '📲',
    heading: 'Add it to your home screen',
    body: "adhTea works best as an app — instant access, no browser bars in the way.",
    installStep: true,
  },
  {
    emoji: '🍃',
    heading: "You've got this",
    body: "adhTea is built for ADHD brains — it's okay to move slow, skip things, and come back later. The app works around you, not the other way around.",
  },
]

export default function OnboardingWelcome({ onDone }) {
  const [step, setStep]       = useState(0)
  const [loading, setLoading] = useState(false)
  const platform = useMemo(() => detectPlatform(), [])

  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1

  async function handleNext() {
    if (!isLast) { setStep(s => s + 1); return }
    setLoading(true)
    try { await seedOnboarding() } catch (_) { /* non-blocking */ }
    onDone()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 pb-12 relative overflow-hidden">
      {/* Same fixed paper/bookshelf background as the rest of the app. */}
      <div className="aria-page-bg" aria-hidden="true" />

      <div className="relative z-10 flex flex-col items-center w-full max-w-xs text-center">

        {/* Logo */}
        <div className="mb-6"><Logo size={56} /></div>

        {/* Step card — lifted paper, matches in-app cards. */}
        <div className="pixel-card w-full px-5 py-6 mb-6">
          <div className="text-4xl mb-3">{current.emoji}</div>
          <h2
            className="text-base text-ui-text mb-3"
            style={{ fontFamily: 'var(--font-pixel)', fontWeight: 600 }}
          >{current.heading}</h2>
          <p className="text-sm text-ui-subtext leading-relaxed mb-3">{current.body}</p>
          {current.bullets && (
            <ul className="text-left space-y-1.5 mt-2">
              {current.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-ui-subtext">
                  <span className="text-ui-accent mt-0.5">✦</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {current.installStep && (() => {
            const inst = INSTALL_INSTRUCTIONS[platform]
            return (
              <div className="mt-3 text-left">
                <p className="text-xs font-semibold text-ui-subtext mb-1.5">{inst.note}</p>
                <ol className="space-y-1.5">
                  {inst.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-ui-subtext">
                      <span className="text-ui-accent font-bold flex-shrink-0">{i + 1}.</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[10px] text-ui-subtext/70 mt-3">You can always come back to this later — just look for the install option in your browser.</p>
              </div>
            )
          })()}
        </div>

        {/* Step dots */}
        <div className="flex gap-2 mb-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === step ? 20 : 8,
                height: 8,
                background: i === step ? 'var(--aria-accent)' : 'var(--aria-border)',
              }}
            />
          ))}
        </div>

        {/* Button */}
        <Button onClick={handleNext} disabled={loading} size="lg">
          {loading ? 'Setting up…' : isLast ? "Let's go →" : 'Next →'}
        </Button>
      </div>
    </div>
  )
}
