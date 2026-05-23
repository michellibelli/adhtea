// Wordmark + tea-leaf glyph. Replaces the previous purple-gradient PNG
// in the mobile top header. Leaf is hardcoded Solarized green (#859900,
// 75% opacity) so it always reads as a fresh tea leaf, independent of
// the active theme's accent colour. Wordmark uses the theme ink colour
// so it retints when the user swaps themes.
//
// Sized via the `size` prop (height in px). Default 32 matches the
// mobile header's 32px logo slot.

export default function Logo({ size = 32 }) {
  const glyph = Math.round(size * 0.72)
  const fontSize = Math.round(size * 0.52)
  return (
    <div className="flex items-center gap-1.5" style={{ height: size }}>
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        {/* Pointed-oval leaf, top-stemmed. */}
        <path
          d="M 12 2 C 18 6 18 18 12 22 C 6 18 6 6 12 2 Z"
          fill="#859900"
          fillOpacity="0.75"
        />
        {/* Midrib — single stroke down the middle so the leaf reads
            as a real leaf at small sizes, not just a green blob. */}
        <path
          d="M 12 4 L 12 20"
          stroke="#586E75"
          strokeWidth="0.9"
          strokeOpacity="0.55"
          strokeLinecap="round"
        />
        {/* Two thin veins on each side for hand-drawn detail. */}
        <path
          d="M 12 9 L 9 11 M 12 9 L 15 11 M 12 14 L 9 16 M 12 14 L 15 16"
          stroke="#586E75"
          strokeWidth="0.5"
          strokeOpacity="0.4"
          strokeLinecap="round"
        />
      </svg>
      <span
        style={{
          fontFamily: 'Lora, Georgia, serif',
          fontStyle: 'italic',
          fontWeight: 600,
          fontSize: fontSize,
          color: 'var(--aria-text)',
          letterSpacing: '0.005em',
          lineHeight: 1,
        }}
      >
        adhTea
      </span>
    </div>
  )
}
