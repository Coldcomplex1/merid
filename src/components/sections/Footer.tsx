import { Link } from 'react-router-dom'
import { useLang } from '../../i18n/LanguageContext'

export default function Footer() {
  const { t } = useLang()

  const links = [
    { label: t.footer.demo, to: '/#demo' },
    { label: t.footer.features, to: '/#features' },
    { label: t.footer.faq, to: '/#faq' },
    { label: t.footer.tutorial, to: '/tutorial' },
    { label: t.footer.waitlist, to: '/#waitlist' },
  ]

  return (
    <footer className="border-t border-navy-700/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 sm:flex-row sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-400 text-base font-extrabold text-navy-900">
            M
          </span>
          <span className="text-sm font-bold text-cream-50">Merid</span>
        </div>

        <p className="text-xs text-navy-300">
          © {new Date().getFullYear()} Merid. {t.footer.tagline}
        </p>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-semibold text-navy-200">
          {links.map((link) => (
            <Link key={link.to} to={link.to} className="transition-colors hover:text-gold-300">
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  )
}
