import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isFirebaseConfigured } from '../lib/firebase'
import { onAuthStateChanged, type User } from '../lib/auth'
import { announceAuthToExtension } from '../lib/extensionBridge'

interface AuthContextValue {
  user: User | null
  /** True until the first auth state resolves — gate redirects on this so a
   *  signed-in user isn't bounced to /login during the initial handshake. */
  loading: boolean
  /** False when VITE_FIREBASE_* env vars are absent (auth UI hides itself). */
  configured: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(configured)

  useEffect(() => {
    if (!configured) return
    return onAuthStateChanged((u) => {
      setUser(u)
      setLoading(false)
      // Hand the session to the Merid extension (single sign-on) if installed.
      announceAuthToExtension(u)
    })
  }, [configured])

  return <AuthContext.Provider value={{ user, loading, configured }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Route guard: renders children only for signed-in users, otherwise sends
 *  them to /login (remembering where they came from). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth()
  const location = useLocation()

  if (!configured) return <Navigate to="/demo" replace />
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-navy-300" role="status">
        <span className="animate-pulse">…</span>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
