/* eslint-disable react-refresh/only-export-components -- co-located THEMES list + context; splitting would just churn imports */
import { createContext, useState, useEffect, useCallback } from 'react'

// Manual theme picker. User selects in Settings → Display → Theme.
// All colours live in CSS variables under [data-theme="..."] blocks in index.css.
// Components use ui-* Tailwind utilities (bg-ui-surface, text-ui-text, etc.)

export const THEMES = [
  { id: 'aria-americano', label: 'Americano', swatch: ['#F3F3E0', '#183B4E', '#27548A', '#DDA853'] },
  { id: 'aria-berries',   label: 'Berries',   swatch: ['#FFF1CB', '#4A2D5C', '#B7A3E3', '#FF8F8F'] },
  { id: 'aria-chai',      label: 'Chai',      swatch: ['#FFF0DD', '#4A2D1A', '#E2A16F', '#86B0BD'] },
]

const STORAGE_KEY = 'aria_theme'
const DEFAULT_THEME = 'aria-americano'

function readStoredTheme() {
  const v = localStorage.getItem(STORAGE_KEY)
  return THEMES.some(t => t.id === v) ? v : DEFAULT_THEME
}

export const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  themes: THEMES,
})

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = useCallback((id) => {
    if (THEMES.some(t => t.id === id)) setThemeState(id)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}
