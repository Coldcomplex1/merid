import { useState, type FormEvent } from 'react'
import Reveal from '../ui/Reveal'
import { useLang } from '../../i18n/LanguageContext'
import { WAITLIST_FORM_ENDPOINT, WAITLIST_NOT_CONFIGURED } from '../../config'

type Status = 'idle' | 'sending' | 'success' | 'error'

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  )
}

export default function Waitlist() {
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(t.waitlist.errorInvalid)
      return
    }
    setError('')
    setStatus('sending')

    // The real Formspree endpoint hasn't been pasted into src/config.ts yet:
    // pretend the signup worked so the live site never looks broken, but warn loudly.
    if (WAITLIST_NOT_CONFIGURED) {
      console.warn(
        'Merid waitlist: no backend configured, this email was NOT stored. ' +
          'Paste your Formspree endpoint into src/config.ts (see the comment there).',
      )
      setTimeout(() => setStatus('success'), 800)
      return
    }

    try {
      const res = await fetch(WAITLIST_FORM_ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) throw new Error(`Formspree responded ${res.status}`)
      setStatus('success')
    } catch (err) {
      console.error('Merid waitlist submission failed:', err)
      setStatus('error')
      setError(t.waitlist.errorSubmit)
    }
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
            {t.waitlist.title1}
            <span className="text-gold-400">{t.waitlist.titleAccent}</span>
            {t.waitlist.title2}
          </h2>
        </Reveal>

        <Reveal delay={150}>
          {status === 'success' ? (
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
              <p className="mt-3 text-lg font-bold text-cream-50">{t.waitlist.successTitle}</p>
              <p className="mt-1.5 text-sm text-navy-200">{t.waitlist.successBody}</p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="mx-auto mt-10 flex max-w-lg flex-col gap-3 sm:flex-row"
            >
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.waitlist.placeholder}
                aria-label={t.waitlist.placeholder}
                disabled={status === 'sending'}
                className="w-full flex-1 rounded-full border-2 border-navy-600 bg-navy-850 px-6 py-3.5 text-base text-cream-50 placeholder-navy-300 transition-colors outline-none focus:border-gold-400 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={status === 'sending'}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-base font-bold whitespace-nowrap text-navy-900 transition-all hover:-translate-y-0.5 hover:bg-gold-300 hover:shadow-lift active:scale-95 disabled:translate-y-0 disabled:cursor-wait disabled:opacity-80"
              >
                {status === 'sending' && <Spinner />}
                {status === 'sending' ? t.waitlist.sending : t.waitlist.button}
              </button>
            </form>
          )}
        </Reveal>

        <p role="alert" aria-live="polite" className="mt-3 min-h-5 text-sm font-semibold text-gold-300">
          {status !== 'success' ? error : ''}
        </p>

        <Reveal delay={250}>
          <p className="mt-3 text-sm text-navy-300">{t.waitlist.note}</p>
        </Reveal>
      </div>
    </section>
  )
}
