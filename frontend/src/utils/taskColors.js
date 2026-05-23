// Tag colours per task type — muted Solarized tints (~70% colour + 30%
// paper base) for a printed-on-cream look. Pairs each fill with a darker
// border, an ink-toned shadow, and an ink text colour. Previous full-
// saturation Solarized fills read as candy on the cream theme.
export const TAG_COLORS = {
  task:        { bg: '#DAA38C', border: '#8C5040', shadow: 'rgba(60,40,20,0.18)', text: '#3D1E0E' },  // dusty rose (was rust)
  appointment: { bg: '#94BEDF', border: '#4E7A9E', shadow: 'rgba(60,40,20,0.18)', text: '#102A40' },  // soft sky (was blue)
  routine:     { bg: '#98C9C0', border: '#5D8782', shadow: 'rgba(60,40,20,0.18)', text: '#163530' },  // seafoam (was teal)
  note:        { bg: '#B4B5D6', border: '#6E709A', shadow: 'rgba(60,40,20,0.18)', text: '#1E2050' },  // lavender mist (was violet)
  project:     { bg: '#DBC587', border: '#8B7440', shadow: 'rgba(60,40,20,0.18)', text: '#3A2E0A' },  // wheat (was amber)
}
