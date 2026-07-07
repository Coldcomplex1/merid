import { Link } from 'react-router-dom'

const LINKS = [
  { label: 'Demo', to: '/#demo' },
  { label: 'Features', to: '/#features' },
  { label: 'Tutorial', to: '/tutorial' },
  { label: 'Waitlist', to: '/#waitlist' },
]

export default function Footer() {
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
          © {new Date().getFullYear()} Merid. Made for Vietnamese learners.
        </p>

        <div className="flex gap-6 text-xs font-semibold text-navy-200">
          {LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="transition-colors hover:text-gold-300">
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  )
}
