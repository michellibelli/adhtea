import { useContext } from 'react'
import { ThemeContext } from '../context/ThemeContext'

// Returns { theme, setTheme, themes }
export function useTheme() {
  return useContext(ThemeContext)
}
