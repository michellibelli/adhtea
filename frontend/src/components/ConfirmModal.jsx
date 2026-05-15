import { useEffect } from 'react'
import Card from './Card'
import Button from './Button'

/**
 * App-styled modal to replace browser confirm(). Reads as part of adhTea
 * rather than as a browser error.
 *
 *   <ConfirmModal
 *     open={...}
 *     emoji="🍵"
 *     title="Ready to triage?"
 *     body="This will re-rank every incomplete task..."
 *     confirmLabel="Start"
 *     cancelLabel="Not now"
 *     onConfirm={...}
 *     onCancel={...}
 *   />
 */
export default function ConfirmModal({
  open,
  emoji = '🍵',
  title = 'Are you ready?',
  body,
  confirmLabel = 'Yes',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) {
  // Esc to cancel
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onCancel?.()
      if (e.key === 'Enter') onConfirm?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onConfirm, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: 'rgba(20,8,40,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
    >
      <Card
        className="px-6 py-5 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <span className="text-3xl flex-shrink-0" aria-hidden="true">{emoji}</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-ui-text leading-snug">{title}</h2>
            {body && (
              <p className="text-sm text-ui-subtext mt-1 leading-relaxed">{body}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </Card>
    </div>
  )
}
