export default function Footer() {
  return (
    <footer className="border-t border-navy-700/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 sm:flex-row sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-400 text-base font-extrabold text-navy-900">
            C
          </span>
          <span className="text-sm font-bold text-cream-50">
            Contextual <span className="font-semibold text-navy-300">by Merid</span>
          </span>
        </div>

        <p className="text-xs text-navy-300">
          © {new Date().getFullYear()} Merid. Made with ☕ for Vietnamese learners.
        </p>

        <div className="flex gap-6 text-xs font-semibold text-navy-200">
          <a href="#demo" className="transition-colors hover:text-gold-300">
            Demo
          </a>
          <a href="#features" className="transition-colors hover:text-gold-300">
            Features
          </a>
          <a href="#waitlist" className="transition-colors hover:text-gold-300">
            Waitlist
          </a>
        </div>
      </div>
    </footer>
  )
}
