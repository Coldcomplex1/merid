import { Link } from 'react-router'
import { useLang } from '../../i18n/LanguageContext'
import InstallButton from '../ui/InstallButton'
import MeridMark from '../ui/MeridMark'

export default function Footer() {
  const { t, lang } = useLang()

  const links = [
    { label: t.footer.demo, to: '/#demo' },
    { label: t.footer.features, to: '/#features' },
    { label: t.footer.faq, to: '/#faq' },
    { label: t.footer.tutorial, to: '/tutorial' },
    { label: t.footer.createDataset, to: '/create-dataset' },
    { label: t.footer.apiKeyGuide, to: '/api-key-guide' },
  ]

  return (
    <footer className="border-t border-line py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 sm:flex-row sm:px-8">
        <div className="flex items-center gap-2.5">
          <MeridMark size={28} />
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
          {/* A real <a>, not a <Link>: /blog is prerendered static HTML that the
              client router knows nothing about, so a <Link> would match the
              catch-all route and render the homepage instead. */}
          <a
            href={lang === 'vi' ? '/blog' : '/en/blog'}
            className="transition-colors hover:text-accent"
          >
            Blog
          </a>
          <InstallButton label={t.footer.install} variant="link" className="text-accent hover:text-accent-hover" />
          <Link to="/privacy-policy" className="transition-colors hover:text-accent">
            {t.footer.privacy}
          </Link>
        </div>
      </div>
    </footer>
  )
}
