import { useContext } from 'react'
import { ThemeContext } from '../context/ThemeContext'

// Returns { name, label } — e.g. { name: 'morning', label: 'Morning' }
// Use ui-* Tailwind classes for colours in components, not theme values.
export function useTheme() {
  return useContext(ThemeContext)
}
