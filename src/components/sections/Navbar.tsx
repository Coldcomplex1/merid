import { Link } from 'react-router-dom'
import { useLang } from '../../i18n/LanguageContext'
import LangToggle from '../ui/LangToggle'

export default function Navbar() {
  const { t } = useLang()

  const links = [
    { label: t.nav.demo, to: '/#demo' },
    { label: t.nav.features, to: '/#features' },
    { label: t.nav.how, to: '/#how-it-works' },
    { label: t.nav.tutorial, to: '/tutorial' },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-navy-700/60 bg-navy-900/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-400 text-lg font-extrabold text-navy-900 shadow-[0_0_20px_-4px_rgb(245_197_66/0.7)]">
            M
          </span>
          <span className="text-lg font-bold text-white">Merid</span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-sm font-semibold text-navy-200 transition-colors hover:text-gold-300"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <LangToggle />
          <Link
            to="/#waitlist"
            className="rounded-full bg-gold-400 px-4 py-2 text-sm font-bold whitespace-nowrap text-navy-900 transition-all hover:bg-gold-300 hover:shadow-lift active:scale-95"
          >
            {t.nav.cta}
          </Link>
        </div>
      </nav>
    </header>
  )
}
