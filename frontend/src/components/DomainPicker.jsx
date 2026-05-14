import { useState } from 'react'
import { Input } from './Input'
import Button from './Button'
import { createDomain } from '../api/domains'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TIMES = [['morning', 'Morn'], ['afternoon', 'Aft'], ['evening', 'Eve']]
const WEIGHTS = [['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy']]

/**
 * Domain selector pills + inline "Other" custom-domain editor.
 *
 * Props:
 *   domains: list of domain objects
 *   value:   currently selected domain_id (or null)
 *   onChange(id):       called when an existing domain is picked
 *   onCreate(domain):   called after a new custom domain is saved
 */
export default function DomainPicker({ domains, value, onChange, onCreate }) {
  const [showCustom, setShowCustom] = useState(false)
  const [name, setName] = useState('')
  const [days, setDays] = useState(new Set([0,1,2,3,4,5,6]))
  const [times, setTimes] = useState(new Set())
  const [weights, setWeights] = useState(new Set())
  const [saving, setSaving] = useState(false)

  function toggle(set, setter, key) {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    setter(next)
  }

  async function saveCustom() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const rule = {
        days: [...days].sort(),
        times: times.size ? [...times] : null,
        weights: weights.size ? [...weights] : null,
      }
      const created = await createDomain({ name: name.trim(), rules: [rule] })
      onCreate?.(created)
      onChange?.(created.id)
      setShowCustom(false)
      setName(''); setDays(new Set([0,1,2,3,4,5,6])); setTimes(new Set()); setWeights(new Set())
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ui-subtext mb-1">Domain</p>
      <div className="flex flex-wrap gap-1.5">
        {domains.map(d => (
          <button
            key={d.id}
            type="button"
            onClick={() => onChange?.(d.id)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              value === d.id
                ? 'bg-ui-primary text-ui-primary-text border-transparent'
                : 'border-ui-border text-ui-subtext hover:text-ui-accent'
            }`}
          >
            {d.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom(s => !s)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
            showCustom
              ? 'bg-ui-primary text-ui-primary-text border-transparent'
              : 'border-ui-border text-ui-subtext hover:text-ui-accent'
          }`}
        >
          + Other
        </button>
      </div>

      {showCustom && (
        <div className="rounded-lg border border-ui-border bg-ui-input/50 p-3 space-y-3">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name (e.g. Errands)"
            autoFocus
          />
          <div>
            <p className="text-[10px] text-ui-subtext mb-1 uppercase tracking-wider">Days allowed</p>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggle(days, setDays, i)}
                  className={`w-9 h-7 rounded text-[10px] font-medium border transition-all ${
                    days.has(i)
                      ? 'bg-ui-primary text-ui-primary-text border-transparent'
                      : 'border-ui-border text-ui-subtext'
                  }`}
                >{d}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-ui-subtext mb-1 uppercase tracking-wider">Times (empty = any)</p>
            <div className="flex flex-wrap gap-1">
              {TIMES.map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => toggle(times, setTimes, val)}
                  className={`px-2 py-1 rounded text-[10px] font-medium border transition-all ${
                    times.has(val)
                      ? 'bg-ui-primary text-ui-primary-text border-transparent'
                      : 'border-ui-border text-ui-subtext'
                  }`}
                >{lbl}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-ui-subtext mb-1 uppercase tracking-wider">Sizes (empty = any)</p>
            <div className="flex flex-wrap gap-1">
              {WEIGHTS.map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => toggle(weights, setWeights, val)}
                  className={`px-2 py-1 rounded text-[10px] font-medium border transition-all ${
                    weights.has(val)
                      ? 'bg-ui-primary text-ui-primary-text border-transparent'
                      : 'border-ui-border text-ui-subtext'
                  }`}
                >{lbl}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveCustom} disabled={!name.trim() || days.size === 0 || saving}>
              {saving ? '…' : 'Save domain'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCustom(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

