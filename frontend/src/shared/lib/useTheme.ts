import { useEffect, useState } from 'react'

/**
 * Light or dark, remembered.
 *
 * Lives here rather than inside the workspace shell because the login and
 * signup screens sit outside it — and someone who prefers dark should not be
 * shown a white page for the one screen they meet first.
 */
const THEME_KEY = 'df360.theme'

export function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark'
    } catch {
      return false
    }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    } catch {
      /* private browsing — the choice just does not persist */
    }
  }, [dark])

  return { dark, toggle: () => setDark((d) => !d) }
}
