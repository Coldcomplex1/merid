import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
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

/** Repeated rather than imported: api/_lib/blog-config.js is the server's copy
 *  and pulling it into the client bundle to save one string is not worth it.
 *  The other copies live in index.html and that file. */
const SITE_URL = 'https://merid.site'

/** Finds a head tag by selector, creating it if index.html never shipped one. */
function headTag(selector: string, create: () => HTMLElement): HTMLElement {
  const existing = document.head.querySelector<HTMLElement>(selector)
  if (existing) return existing

  const tag = create()
  document.head.appendChild(tag)
  return tag
}

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  const tag = headTag(`meta[${attribute}="${key}"]`, () => {
    const meta = document.createElement('meta')
    meta.setAttribute(attribute, key)
    return meta
  })
  tag.setAttribute('content', content)
}

/** Title, description and canonical for one indexable page.
 *
 *  scripts/prerender-seo.mjs already ships the correct canonical in the HTML
 *  Vercel serves, which is the copy crawlers trust. This keeps the head honest
 *  for the other half of the story: client-side navigation, where the document
 *  never reloads, and the language toggle, which rewrites the page in place.
 *
 *  The canonical is derived from the current path rather than passed in, so a
 *  new route cannot be added with someone else's canonical by mistake. Query
 *  strings and hashes are dropped: /tutorial#step-2 is not a separate page.
 *
 *  Only callable from inside the router, which every page component is. */
export function usePageMeta(title: string, description: string) {
  const { pathname } = useLocation()

  usePageTitle(title)

  useEffect(() => {
    const canonical = `${SITE_URL}${pathname}`

    headTag('link[rel="canonical"]', () => {
      const link = document.createElement('link')
      link.setAttribute('rel', 'canonical')
      return link
    }).setAttribute('href', canonical)

    setMeta('name', 'description', description)
    setMeta('property', 'og:url', canonical)
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('name', 'twitter:title', title)
    setMeta('name', 'twitter:description', description)
  }, [pathname, title, description])
}
