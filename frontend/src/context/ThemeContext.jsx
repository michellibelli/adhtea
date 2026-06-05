/* eslint-disable react-refresh/only-export-components -- co-located THEMES list + context; splitting would just churn imports */
import { createContext, useState, useEffect, useCallback } from 'react'

// Manual theme picker. User selects in Settings → Display → Theme.
// All colours live in CSS variables under [data-theme="..."] blocks in index.css.
// Components use ui-* Tailwind utilities (bg-ui-surface, text-ui-text, etc.)

export const THEMES = [
  { id: 'aria-cafe',      label: 'Cafe',      swatch: ['#FDF6E3', '#002B36', '#CB4B16', '#B58900'] },
  { id: 'aria-linen',     label: 'Linen',     swatch: ['#F4F0F6', '#3D3545', '#9B7DB8', '#B8A0C4'] },
]

const STORAGE_KEY = 'aria_theme'
const DEFAULT_THEME = 'aria-cafe'

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
