import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { STRINGS, type Lang, type Strings } from './translations'

const STORAGE_KEY = 'merid-lang'

interface LangContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  /** The active language's string catalog. */
  t: Strings
}

const LangContext = createContext<LangContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Vietnamese is the default; a previously chosen language wins.
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'en' || saved === 'vi' ? saved : 'vi'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  return (
    <LangContext.Provider value={{ lang, setLang, t: STRINGS[lang] }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside <LanguageProvider>')
  return ctx
}

/** Each page sets its own document title (re-applied when the language changes). */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title
  }, [title])
}
