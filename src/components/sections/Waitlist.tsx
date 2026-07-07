import { useState, type FormEvent } from 'react'
import Reveal from '../ui/Reveal'

export default function Waitlist() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [joined, setJoined] = useState(false)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Hmm, that email doesn’t look right. Mind checking it?')
      return
    }
    setError('')
    setJoined(true)
  }

  return (
    <section id="waitlist" className="relative scroll-mt-16 overflow-hidden py-28">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(700px circle at 50% 20%, rgb(245 197 66 / 0.13), transparent 65%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <Reveal>
          <h2 className="text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-5xl">
            Turn the entire internet into your{' '}
            <span className="text-gold-400">vocabulary classroom</span>.
          </h2>
        </Reveal>

        <Reveal delay={150}>
          {joined ? (
            <div className="mx-auto mt-10 max-w-md animate-pop-in rounded-2xl border-2 border-gold-400/60 bg-navy-850 px-8 py-7">
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto text-gold-400"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M8.5 12.5l2.5 2.5 4.5-5" />
              </svg>
              <p className="mt-3 text-lg font-bold text-cream-50">You’re on the list!</p>
              <p className="mt-1.5 text-sm text-navy-200">
                We’ll email you the moment Merid is ready for your browser.
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="mx-auto mt-10 flex max-w-lg flex-col gap-3 sm:flex-row"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                aria-label="Email address"
                className="w-full flex-1 rounded-full border-2 border-navy-600 bg-navy-850 px-6 py-3.5 text-base text-cream-50 placeholder-navy-300 transition-colors outline-none focus:border-gold-400"
              />
              <button
                type="submit"
                className="rounded-full bg-gold-400 px-7 py-3.5 text-base font-bold whitespace-nowrap text-navy-900 transition-all hover:-translate-y-0.5 hover:bg-gold-300 hover:shadow-lift active:scale-95"
              >
                Join the Waitlist
              </button>
            </form>
          )}
        </Reveal>

        {error && !joined && (
          <p className="mt-3 text-sm font-semibold text-gold-300" role="alert">
            {error}
          </p>
        )}

        <Reveal delay={250}>
          <p className="mt-6 text-sm text-navy-300">
            Early users will get access to SAT, B2, C1, and C2 datasets.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
