import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'merid-theme'

/** Background colours that mirror --canvas, kept in sync with index.css and the
 *  inline no-FOUC script in index.html. Used for <meta name="theme-color">. */
const CANVAS = { light: '#faf8f2', dark: '#0e1628' } as const

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** The manually saved preference, or null when the user follows the OS. */
function storedPreference(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

/** Priority: saved manual preference → OS preference. */
function resolveTheme(): Theme {
  return storedPreference() ?? (prefersDark() ? 'dark' : 'light')
}

/** Reflect the active theme onto <html> and the browser UI colour. */
function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', CANVAS[theme])
}

interface ThemeContextValue {
  theme: Theme
  /** True once the user has explicitly picked a theme (vs. following the OS). */
  isManual: boolean
  /** Flip between light and dark and remember the choice. */
  toggle: () => void
  /** Set an explicit theme and remember the choice. */
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The inline script in index.html has already set data-theme before paint;
  // start from it so React never disagrees with what's on screen.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === 'undefined') return 'light'
    const attr = document.documentElement.getAttribute('data-theme')
    return attr === 'light' || attr === 'dark' ? attr : resolveTheme()
  })
  const [isManual, setIsManual] = useState<boolean>(() => storedPreference() !== null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // While following the OS, track live changes to the system preference.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (storedPreference() === null) setThemeState(mql.matches ? 'dark' : 'light')
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage may be unavailable (private mode); theme still applies in-session */
    }
    setIsManual(true)
    setThemeState(next)
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, isManual, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
