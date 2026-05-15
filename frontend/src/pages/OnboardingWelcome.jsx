import { useState, useMemo } from 'react'
import { seedOnboarding } from '../api/auth'

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

const PRIDE = 'linear-gradient(to right, #ED8E89, #F7B685, #F3EBA5, #94C691, #9BD6D9, #B4A8E0)'

const FLOAT_ART = [
  { emoji: '🌸', top: '8%',  left: '7%',  size: 26, dur: 5.8, delay: 0,    rotA: -6,  rotB: 4  },
  { emoji: '✦',  top: '14%', left: '78%', size: 18, dur: 4.4, delay: 1.2,  rotA: -3,  rotB: 6  },
  { emoji: '🍦', top: '28%', left: '88%', size: 24, dur: 6.2, delay: 0.4,  rotA: -5,  rotB: 3  },
  { emoji: '🐱', top: '42%', left: '5%',  size: 22, dur: 5.1, delay: 2.0,  rotA: -4,  rotB: 5  },
  { emoji: '🍃', top: '58%', left: '82%', size: 20, dur: 4.9, delay: 0.8,  rotA: -8,  rotB: 3  },
  { emoji: '⭐', top: '70%', left: '13%', size: 20, dur: 5.5, delay: 1.6,  rotA: -3,  rotB: 7  },
  { emoji: '🌷', top: '80%', left: '70%', size: 24, dur: 6.0, delay: 0.3,  rotA: -5,  rotB: 4  },
  { emoji: '🍬', top: '20%', left: '40%', size: 18, dur: 4.6, delay: 3.1,  rotA: -6,  rotB: 6  },
  { emoji: '🌙', top: '88%', left: '38%', size: 22, dur: 5.3, delay: 1.0,  rotA: -4,  rotB: 4  },
  { emoji: '✿',  top: '6%',  left: '52%', size: 16, dur: 4.2, delay: 2.5,  rotA: -5,  rotB: 5  },
  { emoji: '🍄', top: '50%', left: '55%', size: 20, dur: 5.7, delay: 0.6,  rotA: -3,  rotB: 6  },
  { emoji: '💜', top: '35%', left: '22%', size: 16, dur: 4.8, delay: 1.9,  rotA: -5,  rotB: 3  },
]

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
    emoji: '💜',
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
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 pb-12 relative overflow-hidden"
      style={{ background: '#FFFDF5' }}
    >
      {/* Pride stripe */}
      <div className="fixed top-0 left-0 right-0 h-1" style={{ background: PRIDE }} />

      {/* Floating art */}
      {FLOAT_ART.map((art, i) => (
        <span
          key={i}
          className="float-art"
          style={{
            top: art.top, left: art.left,
            '--bob-size':    `${art.size}px`,
            '--bob-dur':     `${art.dur}s`,
            '--bob-delay':   `${art.delay}s`,
            '--bob-rot-a':   `${art.rotA}deg`,
            '--bob-rot-b':   `${art.rotB}deg`,
            '--bob-opacity': 0.45,
          }}
        >
          {art.emoji}
        </span>
      ))}

      <div className="relative z-10 flex flex-col items-center w-full max-w-xs text-center">

        {/* Logo */}
        <img
          src="/adhTeaLogo.png"
          alt="adhTea"
          className="w-20 object-contain opacity-90 rounded-2xl mb-6"
        />

        {/* Step card */}
        <div className="w-full rounded-sm border-2 border-[#E8D8C8] bg-[#FDF8EE]/90 px-5 py-6 backdrop-blur-sm mb-6">
          <div className="text-4xl mb-3">{current.emoji}</div>
          <h2 className="text-base font-semibold text-[#3D2B1F] mb-3">{current.heading}</h2>
          <p className="text-sm text-[#7A6152] leading-relaxed mb-3">{current.body}</p>
          {current.bullets && (
            <ul className="text-left space-y-1.5 mt-2">
              {current.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[#7A6152]">
                  <span className="text-[#B4A8E0] mt-0.5">✦</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {current.installStep && (() => {
            const inst = INSTALL_INSTRUCTIONS[platform]
            return (
              <div className="mt-3 text-left">
                <p className="text-xs font-semibold text-[#7A6152] mb-1.5">{inst.note}</p>
                <ol className="space-y-1.5">
                  {inst.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#7A6152]">
                      <span className="text-[#B4A8E0] font-bold flex-shrink-0">{i + 1}.</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[10px] text-[#A8967E] mt-3">You can always come back to this later — just look for the install option in your browser.</p>
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
                background: i === step ? '#B4A8E0' : '#E8D8C8',
              }}
            />
          ))}
        </div>

        {/* Button */}
        <button
          onClick={handleNext}
          disabled={loading}
          className="w-full py-2.5 rounded-sm border-2 border-[#B4A8E0] bg-[#B4A8E0] text-[#3D2B1F] text-sm font-semibold hover:bg-[#A498D0] hover:border-[#A498D0] active:scale-95 transition-all disabled:opacity-60"
        >
          {loading ? 'Setting up…' : isLast ? "Let's go →" : 'Next →'}
        </button>
      </div>
    </div>
  )
}
