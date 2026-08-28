// Real-world load timing.
//
// performance.now() is measured from timeOrigin — navigation start — so these
// marks include HTML + JS download and parse, not just React's own work. That's
// the number worth comparing across hosting plans; a mark taken from app boot
// would hide exactly the part the CDN and the bundle size control.
//
// Added during the Render Starter trial (2026-08) alongside the `?covers=on`
// gate in App.jsx: with the loading covers hidden, this is how the wait gets
// measured instead of eyeballed.

const marks = {}

// First call for a name wins — `ready` and `page` each happen once per load, and
// a remount (refreshKey) must not overwrite the original figure.
export function markLoad(name) {
  if (marks[name] !== undefined) return
  marks[name] = Math.round(performance.now())
  console.log(`[load] ${name} ${marks[name]}ms`)
  window.dispatchEvent(new CustomEvent('aria:load-timing', { detail: { ...marks } }))
}

export function getLoadMarks() {
  return { ...marks }
}
