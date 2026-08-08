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
//
// The three ways in fail differently and are told apart deliberately: naming the
// wrong cause here costs whoever is setting this up an evening of re-pasting a
// UID that was right the first time.
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { checkIsAdmin, type AdminStatus } from '../../lib/posts'

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-5 py-24 text-center">
      <h1 className="text-2xl font-extrabold text-heading">{title}</h1>
      {children}
      <Link
        to="/"
        className="mt-6 inline-block rounded-full border border-line-strong px-5 py-2.5 font-semibold text-heading transition-colors hover:border-accent hover:text-accent"
      >
        Back to Merid
      </Link>
    </div>
  )
}

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [status, setStatus] = useState<AdminStatus | 'checking'>('checking')

  useEffect(() => {
    if (!user) return
    let active = true
    checkIsAdmin(user.uid).then((result) => {
      if (active) setStatus(result)
    })
    return () => {
      active = false
    }
  }, [user])

  if (status === 'checking') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted" role="status">
        <span className="animate-pulse">…</span>
      </div>
    )
  }

  // Firestore refused to answer a question it is supposed to answer for anyone
  // signed in, so the rules deciding this are not the ones in the repo. On a
  // fresh project they were simply never uploaded, and no amount of fiddling
  // with the admins document will help until they are.
  if (status === 'rules-not-deployed') {
    return (
      <Shell title="The security rules are not deployed">
        <p className="mt-3 leading-relaxed text-body">
          Firestore refused to say whether this account is an admin, which it only does when
          the rules in <code className="rounded bg-surface-2 px-1.5 py-0.5">firestore.rules</code>{' '}
          have not been uploaded to the project. Your{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5">admins</code> document is probably
          fine — nothing can read it yet.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-surface-2 px-4 py-3 text-left text-sm text-body">
          firebase deploy --only firestore:rules,storage
        </pre>
        <p className="mt-2 text-sm text-muted">See BLOG_WORKFLOW.md, section 1.4.</p>
      </Shell>
    )
  }

  if (status === 'unreachable') {
    return (
      <Shell title="Could not reach Firestore">
        <p className="mt-3 leading-relaxed text-body">
          The admin check did not complete, so this is not an answer about your account. Check
          your connection, and whether an extension or network is blocking Firestore, then
          reload.
        </p>
      </Shell>
    )
  }

  if (status === 'not-admin') {
    return (
      <Shell title="Not an admin account">
        <p className="mt-3 leading-relaxed text-body">
          Firestore answered, and there is no admin document for this account. Adding it means
          creating a document at{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5">admins/{user?.uid}</code> in the
          Firebase console — the document ID must match that UID exactly, with no trailing
          space.
        </p>
        <p className="mt-2 text-sm text-muted">See BLOG_WORKFLOW.md, section 1.2.</p>
      </Shell>
    )
  }

  return children
}
