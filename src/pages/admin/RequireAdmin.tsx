// Route guard for the blog admin.
//
// Layered on top of RequireAuth: signed in is not the same as allowed. Admin
// rights are the existence of an `admins/{uid}` document, so this asks Firestore
// rather than checking a list baked into the bundle.
//
// This gate decides what to *render*. It is not the security boundary - someone
// who bypasses it reaches a screen whose every write Firestore refuses, because
// the same check runs inside firestore.rules and storage.rules. Treating the UI
// as the boundary is exactly the mistake that makes admin panels leak.
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { checkIsAdmin } from '../../lib/posts'

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [state, setState] = useState<'checking' | 'yes' | 'no'>('checking')

  useEffect(() => {
    if (!user) return
    let active = true
    checkIsAdmin(user.uid).then((ok) => {
      if (active) setState(ok ? 'yes' : 'no')
    })
    return () => {
      active = false
    }
  }, [user])

  if (state === 'checking') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted" role="status">
        <span className="animate-pulse">…</span>
      </div>
    )
  }

  if (state === 'no') {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <h1 className="text-2xl font-extrabold text-heading">Not an admin account</h1>
        <p className="mt-3 leading-relaxed text-body">
          This account is signed in but is not on the blog admin list. Adding it means creating
          a document at <code className="rounded bg-surface-2 px-1.5 py-0.5">admins/{user?.uid}</code>{' '}
          in the Firebase console.
        </p>
        <p className="mt-2 text-sm text-muted">See BLOG_WORKFLOW.md, section 1.</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-full border border-line-strong px-5 py-2.5 font-semibold text-heading transition-colors hover:border-accent hover:text-accent"
        >
          Back to Merid
        </Link>
      </div>
    )
  }

  return children
}
