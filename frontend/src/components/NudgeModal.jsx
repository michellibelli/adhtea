import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { respondNudge } from '../api/insights'
import Card from './Card'
import Button from './Button'

const AUTO_DISMISS_MS = 8000

const AFFIRM_LABELS = {
  sleep:    'Will do 💛',
  meals:    'Yes! 💛',
  exercise: 'On it 💛',
  checkin:  'Sure 💛',
}

export default function NudgeModal({ nudge, onDismiss }) {
  const respondedRef = useRef(false)

  function respond(value) {
    if (respondedRef.current) return
    respondedRef.current = true
    respondNudge(nudge.id, value).catch(() => {})
    onDismiss()
  }

  useEffect(() => {
    const timer = setTimeout(() => respond('dismissed'), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') respond('dismissed')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!nudge) return null

  const affirmLabel = AFFIRM_LABELS[nudge.variable] || 'Yes 💛'

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[20vh] overflow-y-auto"
      style={{ background: 'rgba(60,40,20,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={() => respond('dismissed')}
    >
      <Card
        className="px-6 py-5 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <span className="text-3xl flex-shrink-0" aria-hidden="true">🍵</span>
          <p className="text-sm text-ui-text leading-relaxed">{nudge.message}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => respond('no')}>Not yet</Button>
          <Button onClick={() => respond('yes')}>{affirmLabel}</Button>
        </div>
      </Card>
    </div>,
    document.body,
  )
}
