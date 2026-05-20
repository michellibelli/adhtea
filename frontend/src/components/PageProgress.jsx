import { useEffect, useState } from 'react'

export default function PageProgress({ trigger }) {
  const [active, setActive] = useState(false)
  const [done,   setDone]   = useState(false)

  useEffect(() => {
    // Resets bar on each new `trigger`; synchronous resets are the point.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDone(false)
    setActive(true)
    const finish = setTimeout(() => setDone(true),  500)
    const reset  = setTimeout(() => setActive(false), 750)
    return () => { clearTimeout(finish); clearTimeout(reset) }
  }, [trigger])

  if (!active) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        background: 'linear-gradient(to right, #ED8E89, #F7B685, #F3EBA5, #94C691, #9BD6D9, #B4A8E0)',
        transformOrigin: 'left center',
        transform: done ? 'scaleX(1)' : 'scaleX(0.4)',
        opacity: done ? 0 : 1,
        transition: done
          ? 'transform 200ms ease-out, opacity 250ms ease-in 200ms'
          : 'transform 400ms cubic-bezier(0.1, 0.6, 0.4, 1)',
      }}
    />
  )
}
