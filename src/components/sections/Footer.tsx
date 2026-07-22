import { Link } from 'react-router-dom'
import { useLang } from '../../i18n/LanguageContext'
import InstallButton from '../ui/InstallButton'

export default function Footer() {
  const { t } = useLang()

  const links = [
    { label: t.footer.demo, to: '/#demo' },
    { label: t.footer.features, to: '/#features' },
    { label: t.footer.faq, to: '/#faq' },
    { label: t.footer.tutorial, to: '/tutorial' },
    { label: t.nav.tryIt, to: '/try' },
    { label: t.footer.createDataset, to: '/create-dataset' },
    { label: t.footer.apiKeyGuide, to: '/api-key-guide' },
  ]

  return (
    <footer className="border-t border-line py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 sm:flex-row sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-400 text-base font-extrabold text-navy-900">
            M
          </span>
          <span className="text-sm font-bold text-heading">Merid</span>
        </div>

        <p className="text-xs text-muted">
          © {new Date().getFullYear()} Merid. {t.footer.tagline}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold text-body">
          {links.map((link) => (
            <Link key={link.to} to={link.to} className="transition-colors hover:text-accent">
              {link.label}
            </Link>
          ))}
          <InstallButton label={t.footer.install} variant="link" className="text-accent hover:text-accent-hover" />
          <Link to="/privacy-policy" className="transition-colors hover:text-accent">
            {t.footer.privacy}
          </Link>
        </div>
      </div>
    </footer>
  )
}
