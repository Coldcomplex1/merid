// Thin wrapper around Firebase Auth (email/password).
//
// Firebase handles the sensitive parts server-side: passwords are hashed with
// scrypt on Google's servers (the client only ever sends them over TLS during
// sign-in/up), and the SDK manages the ID token (a JWT valid for ~1 hour)
// plus its refresh token automatically. Every Firestore request carries the
// current ID token, which security rules check via request.auth.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type User,
} from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import { firebaseAuth } from './firebase'

export type { User }

export const MIN_PASSWORD_LENGTH = 8

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Client-side pre-checks. Returns an error message key or null when valid.
 *  (Server-side, Firebase enforces its own email/password policy again.) */
export function validateCredentials(email: string, password: string): 'invalidEmail' | 'weakPassword' | null {
  if (!EMAIL_RE.test(email.trim())) return 'invalidEmail'
  if (password.length < MIN_PASSWORD_LENGTH) return 'weakPassword'
  return null
}

export async function signUp(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password)
  return cred.user
}

export async function signIn(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password)
  return cred.user
}

export function signOut(): Promise<void> {
  return firebaseSignOut(firebaseAuth())
}

export function onAuthStateChanged(cb: (user: User | null) => void): () => void {
  return firebaseOnAuthStateChanged(firebaseAuth(), cb)
}

/** Map Firebase auth errors to coarse buckets. Wrong email vs. wrong password
 *  (and unknown accounts) all collapse into 'badCredentials' so the UI never
 *  reveals whether an email is registered. */
export type AuthErrorKind = 'badCredentials' | 'emailInUse' | 'weakPassword' | 'tooManyRequests' | 'network' | 'unknown'

export function classifyAuthError(err: unknown): AuthErrorKind {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/invalid-credential':
      case 'auth/invalid-email':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/user-disabled':
        return 'badCredentials'
      case 'auth/email-already-in-use':
        return 'emailInUse'
      case 'auth/weak-password':
      case 'auth/password-does-not-meet-requirements':
        return 'weakPassword'
      case 'auth/too-many-requests':
        return 'tooManyRequests'
      case 'auth/network-request-failed':
        return 'network'
    }
  }
  return 'unknown'
}
