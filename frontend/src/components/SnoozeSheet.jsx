import { useState } from 'react'
import { createPortal } from 'react-dom'
import { SNOOZE_OPTIONS, resolveSnoozeDate } from '../utils/snooze'
import Button from './Button'
import { Input } from './Input'

export default function SnoozeSheet({ onSnooze, onClose, domainName = null }) {
  const [customDate, setCustomDate] = useState('')

  function handleOption(option) {
    const date = resolveSnoozeDate(option.id, null, domainName)
    if (date) onSnooze(date.toISOString())
  }

  function handleCustomSubmit() {
    if (!customDate) return
    const date = resolveSnoozeDate('custom', customDate, domainName)
    if (date) onSnooze(date.toISOString())
  }

  // Portal to document.body so .aria-page's permanent transform context
  // doesn't pin `fixed` to the page instead of the viewport.
  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-ui-surface border-t border-ui-border rounded-t-2xl pb-safe md:left-1/2 md:right-auto md:bottom-auto md:top-[20vh] md:-translate-x-1/2 md:translate-y-0 md:w-96 md:rounded-2xl md:border">

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-ui-border" />
        </div>

        <div className="px-4 pt-2 pb-6">
          <p className="text-base font-semibold text-ui-text mb-4">Snooze until…</p>

          <div className="space-y-1">
            {SNOOZE_OPTIONS.filter(o => o.id !== 'custom').map((option) => (
              <button
                key={option.id}
                onClick={() => handleOption(option)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-ui-input border border-ui-border text-ui-text hover:opacity-80 active:scale-[0.98] transition-all duration-100 text-left"
              >
                <span className="font-medium text-sm">{option.label}</span>
                {option.sublabel && (
                  <span className="text-xs text-ui-subtext">{option.sublabel}</span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <Input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="flex-1"
            />
            <Button onClick={handleCustomSubmit} disabled={!customDate}>
              Set
            </Button>
          </div>

          <Button variant="ghost" className="w-full mt-3" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}
