import { createContext, useState, useEffect } from 'react'
import { getTwilightName, THEME_LABELS } from '../utils/twilight'

// ThemeContext now only exposes the theme name — all colours live in CSS.
// Components use ui-* Tailwind utilities (bg-ui-surface, text-ui-text, etc.)
// rather than reading class strings from context.

export const ThemeContext = createContext({ name: 'morning', label: 'Morning' })

export function ThemeProvider({ children }) {
  const [name] = useState(getTwilightName)

  // Apply data-theme to <html> so CSS variable blocks activate
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', name)
  }, [name])

  return (
    <ThemeContext.Provider value={{ name, label: THEME_LABELS[name] }}>
      {children}
    </ThemeContext.Provider>
  )
}
