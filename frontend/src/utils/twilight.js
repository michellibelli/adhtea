// Maps the current hour to one of four time-of-day theme names.
// The theme name is applied as data-theme="..." on <html> by ThemeContext.
// All actual colour values live in index.css — not here.

export const THEME_NAMES = ['dawn', 'morning', 'afternoon', 'evening']

export function getTwilightName() {
  return THEME_NAMES[Math.floor(new Date().getHours() / 6)]
}

export const THEME_LABELS = {
  dawn: 'Dawn',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}
