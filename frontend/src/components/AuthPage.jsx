const FLOAT_ART = [
  { emoji: '🌸', top: '8%',  left: '7%',  size: 26, dur: 5.8, delay: 0,   rotA: -6, rotB: 4 },
  { emoji: '✦',  top: '14%', left: '78%', size: 18, dur: 4.4, delay: 1.2, rotA: -3, rotB: 6 },
  { emoji: '🍦', top: '28%', left: '88%', size: 24, dur: 6.2, delay: 0.4, rotA: -5, rotB: 3 },
  { emoji: '🐱', top: '42%', left: '5%',  size: 22, dur: 5.1, delay: 2.0, rotA: -4, rotB: 5 },
  { emoji: '🍃', top: '58%', left: '82%', size: 20, dur: 4.9, delay: 0.8, rotA: -8, rotB: 3 },
  { emoji: '⭐', top: '70%', left: '13%', size: 20, dur: 5.5, delay: 1.6, rotA: -3, rotB: 7 },
  { emoji: '🌷', top: '80%', left: '70%', size: 24, dur: 6.0, delay: 0.3, rotA: -5, rotB: 4 },
  { emoji: '🍬', top: '20%', left: '40%', size: 18, dur: 4.6, delay: 3.1, rotA: -6, rotB: 6 },
  { emoji: '🌙', top: '88%', left: '38%', size: 22, dur: 5.3, delay: 1.0, rotA: -4, rotB: 4 },
  { emoji: '✿',  top: '6%',  left: '52%', size: 16, dur: 4.2, delay: 2.5, rotA: -5, rotB: 5 },
  { emoji: '🍄', top: '50%', left: '55%', size: 20, dur: 5.7, delay: 0.6, rotA: -3, rotB: 6 },
  { emoji: '💜', top: '35%', left: '22%', size: 16, dur: 4.8, delay: 1.9, rotA: -5, rotB: 3 },
  { emoji: '🫖', top: '3%',  left: '32%', size: 22, dur: 5.0, delay: 0.7, rotA: -4, rotB: 5 },
  { emoji: '✧',  top: '11%', left: '90%', size: 14, dur: 3.9, delay: 2.2, rotA: -6, rotB: 6 },
  { emoji: '🌺', top: '23%', left: '2%',  size: 20, dur: 5.6, delay: 1.5, rotA: -5, rotB: 3 },
  { emoji: '🍵', top: '32%', left: '60%', size: 22, dur: 4.7, delay: 0.2, rotA: -3, rotB: 7 },
  { emoji: '💫', top: '46%', left: '75%', size: 18, dur: 5.2, delay: 2.8, rotA: -7, rotB: 4 },
  { emoji: '🌼', top: '63%', left: '28%', size: 20, dur: 6.1, delay: 1.3, rotA: -4, rotB: 5 },
  { emoji: '🍩', top: '74%', left: '88%', size: 18, dur: 4.5, delay: 0.9, rotA: -5, rotB: 3 },
  { emoji: '✨', top: '85%', left: '18%', size: 16, dur: 5.4, delay: 2.4, rotA: -3, rotB: 6 },
  { emoji: '🐝', top: '92%', left: '60%', size: 18, dur: 4.3, delay: 1.7, rotA: -6, rotB: 4 },
  { emoji: '🌈', top: '17%', left: '18%', size: 22, dur: 5.9, delay: 3.4, rotA: -4, rotB: 5 },
  { emoji: '🍓', top: '55%', left: '43%', size: 18, dur: 4.8, delay: 0.5, rotA: -5, rotB: 4 },
  { emoji: '💐', top: '78%', left: '48%', size: 20, dur: 5.3, delay: 2.1, rotA: -3, rotB: 6 },
]

export default function AuthPage({ children }) {
  return (
    <div
      className="min-h-dvh flex flex-col items-center relative overflow-hidden"
      style={{ background: '#7B72CC' }}
    >
      {/* Floating background art */}
      {FLOAT_ART.map((art, i) => (
        <span
          key={i}
          className="float-art select-none pointer-events-none"
          style={{
            top: art.top,
            left: art.left,
            '--bob-size':    `${art.size}px`,
            '--bob-dur':     `${art.dur}s`,
            '--bob-delay':   `${art.delay}s`,
            '--bob-rot-a':   `${art.rotA}deg`,
            '--bob-rot-b':   `${art.rotB}deg`,
            '--bob-opacity': 0.35,
          }}
        >
          {art.emoji}
        </span>
      ))}

      {/* Logo */}
      <div className="relative z-10 pt-16 pb-6">
        <img
          src="/adhTeaLogo.png"
          alt="adhTea"
          className="rounded-3xl"
          style={{ width: '180px' }}
        />
      </div>

      {/* Form card */}
      <div className="relative z-10 w-full max-w-sm px-6 pb-16">
        <div className="bg-white/20 backdrop-blur-sm rounded-3xl px-6 py-8 border border-white/30">
          {children}
        </div>
      </div>
    </div>
  )
}
