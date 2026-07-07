const LINKS = [
  { label: 'Demo', href: '#demo' },
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
]

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-navy-700/60 bg-navy-900/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href="#" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-400 text-lg font-extrabold text-navy-900 shadow-[0_0_20px_-4px_rgb(245_197_66/0.7)]">
            C
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold text-white">Contextual</span>
            <span className="block text-[10px] font-semibold tracking-[0.18em] text-navy-300 uppercase">
              by Merid
            </span>
          </span>
        </a>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-navy-200 transition-colors hover:text-gold-300"
            >
              {link.label}
            </a>
          ))}
        </div>

        <a
          href="#waitlist"
          className="rounded-full bg-gold-400 px-4 py-2 text-sm font-bold text-navy-900 transition-all hover:bg-gold-300 hover:shadow-lift active:scale-95"
        >
          Join the Waitlist
        </a>
      </nav>
    </header>
  )
}
