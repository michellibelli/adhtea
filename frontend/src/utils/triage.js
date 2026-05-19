// Tiny localStorage helpers tracking whether the user has run triage today.
// Used by Focus to show / hide the "triage now?" prompt, and by the Triage
// page to mark itself complete after Apply.

const TRIAGE_KEY = 'aria_triage_done'

export function markTriageDone() {
  localStorage.setItem(TRIAGE_KEY, new Date().toDateString())
}

export function wasTriageDoneToday() {
  return localStorage.getItem(TRIAGE_KEY) === new Date().toDateString()
}
