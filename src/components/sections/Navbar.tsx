import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useLang } from '../../i18n/LanguageContext'
import { useAuth } from '../../auth/AuthContext'
import { signOut } from '../../lib/auth'
import LangToggle from '../ui/LangToggle'
import ThemeToggle from '../ui/ThemeToggle'
import InstallButton from '../ui/InstallButton'

export default function Navbar() {
  const { t } = useLang()
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  const links = [
    { label: t.nav.demo, to: '/#demo' },
    { label: t.nav.features, to: '/#features' },
    { label: t.nav.how, to: '/#how-it-works' },
    { label: t.nav.tutorial, to: '/tutorial' },
    { label: t.nav.tryIt, to: '/try' },
    { label: t.nav.createDataset, to: '/create-dataset' },
  ]

  // Close the menu on navigation and on outside clicks.
  useEffect(() => setMenuOpen(false), [location])
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const menuItem =
    'block w-full rounded-lg px-4 py-2.5 text-left text-sm font-semibold text-body transition-colors hover:bg-surface-2 hover:text-accent'

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-400 text-lg font-extrabold text-navy-900 shadow-[0_0_20px_-4px_rgb(245_197_66/0.7)]">
            M
          </span>
          <span className="text-lg font-bold text-heading">Merid</span>
        </Link>

        {/* Six links (in both languages) fit on one line only once the nav
            container reaches its full max-w-6xl width (1152px), each label
            kept on a single line via nowrap; below that they live in the
            hamburger. Measured against the longer Vietnamese labels. */}
        <div className="hidden items-center gap-4 min-[1152px]:flex">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-sm font-semibold whitespace-nowrap text-body transition-colors hover:text-accent"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <LangToggle />
          <ThemeToggle />
          {/* Login must always be discoverable, not only inside the hamburger. */}
          {/* Inline "Log in" only while the nav links are folded away - with
              all six links inline the Vietnamese labels leave no slack for it.
              The hamburger always carries login/signup at every width. */}
          {!user && (
            <Link
              to="/login"
              className="hidden text-sm font-semibold whitespace-nowrap text-body transition-colors hover:text-accent md:block min-[1152px]:hidden"
            >
              {t.deck.menu.login}
            </Link>
          )}
          <span className="hidden sm:block">
            <InstallButton label={t.nav.cta} variant="compact" />
          </span>

          {/* Hamburger: account + deck entry points (all breakpoints). */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={t.deck.menu.open}
              aria-expanded={menuOpen}
              className="flex h-9 w-9 flex-col items-center justify-center gap-[5px] rounded-lg border border-line-strong transition-colors hover:border-accent"
            >
              <span className="h-0.5 w-4.5 rounded bg-body" />
              <span className="h-0.5 w-4.5 rounded bg-body" />
              <span className="h-0.5 w-4.5 rounded bg-body" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-60 rounded-xl border border-line bg-surface p-2 shadow-lift">
                {/* Install CTA: the primary action, always available on mobile. */}
                <div className="p-1 sm:hidden">
                  <InstallButton label={t.nav.cta} variant="menu" />
                </div>
                <div className="my-2 border-t border-line sm:hidden" />

                {/* Main nav (below 1152px; desktop shows these inline). */}
                <div className="min-[1152px]:hidden">
                  {links.map((link) => (
                    <Link key={link.to} to={link.to} className={menuItem}>
                      {link.label}
                    </Link>
                  ))}
                  <div className="my-2 border-t border-line" />
                </div>

                <Link to="/my-deck" className={menuItem}>
                  {t.deck.menu.deck}
                </Link>
                <div className="my-2 border-t border-line" />

                {user ? (
                  <>
                    <p className="truncate px-4 py-1 text-xs text-muted">{user.email}</p>
                    <button type="button" onClick={() => void signOut()} className={menuItem}>
                      {t.deck.menu.logout}
                    </button>
                  </>
                ) : (
                  // Always offered: /login itself explains the rare case where
                  // accounts are unavailable, instead of hiding the entry point.
                  <>
                    <Link to="/login" className={menuItem}>
                      {t.deck.menu.login}
                    </Link>
                    <Link to="/signup" className={menuItem}>
                      {t.deck.menu.signup}
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  )
}
