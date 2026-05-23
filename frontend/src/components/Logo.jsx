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
        {/* Lanceolate (lance-shaped) tea leaf — pointed tip, tapered
            base, ~3:1 length-to-width ratio. Matches the real shape
            of Camellia sinensis leaves rather than a generic oval. */}
        <path
          d="M 12 1.5 C 15.5 5 16 14 12 22.5 C 8 14 8.5 5 12 1.5 Z"
          fill="#859900"
          fillOpacity="0.78"
        />
        {/* Strong central midrib running the full length. */}
        <path
          d="M 12 3 L 12 21"
          stroke="#3F5520"
          strokeWidth="0.85"
          strokeOpacity="0.65"
          strokeLinecap="round"
        />
        {/* Five pairs of side veins, angling outward and downward
            from the midrib in a V-pattern — the signature look of
            a tea leaf at glance. */}
        <path
          d="M 12 5.5  L 10.5 6.5  M 12 5.5  L 13.5 6.5
             M 12 8.5  L 9.8  10   M 12 8.5  L 14.2 10
             M 12 11.5 L 9.5  13.2 M 12 11.5 L 14.5 13.2
             M 12 14.5 L 9.8  15.8 M 12 14.5 L 14.2 15.8
             M 12 17.5 L 10.6 18.4 M 12 17.5 L 13.4 18.4"
          stroke="#3F5520"
          strokeWidth="0.5"
          strokeOpacity="0.5"
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
