import { createPortal } from 'react-dom'
import Card from './Card'
import Button from './Button'

// Asked exactly once per task, right when it becomes part of today (kettle
// quick-add, or promoted from Inbox). Capture.jsx asks inline in its own form
// instead of this popup, since a form is already open there.
export default function WorkAsk({ title, onAnswer }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[20vh] overflow-y-auto"
      style={{ background: 'rgba(60,40,20,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={() => onAnswer(false)}
    >
      <Card
        className="px-6 py-5 max-w-sm w-full"
        style={{ background: 'color-mix(in srgb, var(--aria-surface) 80%, transparent)', backdropFilter: 'blur(8px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <span className="text-3xl flex-shrink-0" aria-hidden="true">🍵</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ui-text truncate">{title}</p>
            <p className="text-xs text-ui-subtext mt-0.5">Work, or not work?</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => onAnswer(false)}>Not work</Button>
          <Button onClick={() => onAnswer(true)}>Work</Button>
        </div>
      </Card>
    </div>,
    document.body,
  )
}
