import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { classifyAuthError, signIn, signInWithGoogle, signUp, validateCredentials } from '../lib/auth'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

/** Google "G" logo (official colors), inlined so no external asset loads. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/** Shared login/signup form. Error copy is intentionally coarse: invalid
 *  email, unknown account and wrong password all read the same, so the form
 *  can't be used to probe which emails are registered (A07). */
export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { t } = useLang()
  const { user, configured } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const isSignup = mode === 'signup'
  usePageTitle(`${isSignup ? t.deck.auth.signupTitle : t.deck.auth.loginTitle} · Merid`)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from || '/my-deck'} replace />
  }

  const errors = t.deck.auth.errors
  if (!configured) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="rounded-xl border border-line bg-surface p-6 text-body">{errors.notConfigured}</p>
        <Link to="/" className="mt-4 inline-block font-semibold text-accent hover:text-accent-hover hover:underline">
          {t.deck.backHome} →
        </Link>
      </div>
    )
  }

  const goToDeck = () => {
    const from = (location.state as { from?: string } | null)?.from
    navigate(from || '/my-deck', { replace: true })
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const invalid = validateCredentials(email, password)
    if (invalid) {
      setError(invalid === 'invalidEmail' ? errors.invalidEmail : errors.weakPassword)
      return
    }
    setError(null)
    setBusy(true)
    try {
      await (isSignup ? signUp(email, password) : signIn(email, password))
      goToDeck()
    } catch (err) {
      setError(errors[classifyAuthError(err)])
    } finally {
      setBusy(false)
    }
  }

  const onGoogle = async () => {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle()
      goToDeck()
    } catch (err) {
      const kind = classifyAuthError(err)
      // Closing the account picker isn't an error worth shouting about.
      if (kind !== 'cancelled') setError(errors[kind])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-3xl font-bold text-heading">{isSignup ? t.deck.auth.signupTitle : t.deck.auth.loginTitle}</h1>

      <button
        type="button"
        onClick={() => void onGoogle()}
        disabled={busy}
        className="mt-8 flex w-full items-center justify-center gap-2.5 rounded-full border border-line-strong bg-surface px-6 py-3 text-sm font-bold text-heading transition-all hover:border-accent active:scale-95 disabled:opacity-60"
      >
        <GoogleLogo />
        {t.deck.auth.googleButton}
      </button>

      <div className="mt-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-muted">
        <span className="h-px flex-1 bg-line" />
        {t.deck.auth.orEmail}
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-body">{t.deck.auth.email}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-heading placeholder-muted focus:border-accent focus:outline-none"
            placeholder="you@example.com"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-body">{t.deck.auth.password}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={8}
            className="rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-heading placeholder-muted focus:border-accent focus:outline-none"
            placeholder="••••••••"
          />
        </label>

        {error && (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-full bg-gold-400 px-6 py-3 text-sm font-bold text-navy-900 transition-all hover:bg-gold-300 active:scale-95 disabled:opacity-60"
        >
          {isSignup ? t.deck.auth.submitSignup : t.deck.auth.submitLogin}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        <Link
          to={isSignup ? '/login' : '/signup'}
          state={location.state}
          className="font-semibold text-accent hover:text-accent-hover hover:underline"
        >
          {isSignup ? t.deck.auth.switchToLogin : t.deck.auth.switchToSignup}
        </Link>
      </p>
    </div>
  )
}
