import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { classifyAuthError, signIn, signUp, validateCredentials } from '../lib/auth'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

/** Shared login/signup form. Error copy is intentionally coarse — invalid
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
      const from = (location.state as { from?: string } | null)?.from
      navigate(from || '/my-deck', { replace: true })
    } catch (err) {
      setError(errors[classifyAuthError(err)])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-3xl font-bold text-heading">{isSignup ? t.deck.auth.signupTitle : t.deck.auth.loginTitle}</h1>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
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
