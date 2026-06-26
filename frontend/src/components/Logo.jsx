export default function Logo({ size = 32 }) {
  const imgSize = Math.round(size * 0.75)
  const fontSize = Math.round(size * 0.52)
  return (
    <div className="flex items-center gap-1.5" style={{ height: size }}>
      <img
        src="/flowers/tea-cup-desat.png"
        alt=""
        width={imgSize}
        height={imgSize}
        style={{ objectFit: 'contain', transform: 'translate(2px, -2px)' }}
        aria-hidden="true"
      />
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
