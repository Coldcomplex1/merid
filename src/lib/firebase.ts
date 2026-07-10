// Firebase bootstrap. All config comes from VITE_FIREBASE_* env vars so no
// project identifiers are hardcoded in the bundle source (see .env.example).
//
// The web config is not a secret — Firestore security rules and API-key
// referrer restrictions are what actually protect user data (docs/FIREBASE_SETUP.md).
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const REQUIRED_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

/** True when every VITE_FIREBASE_* var is present (e.g. false on preview
 *  deploys without env config — pages then fall back to demo/mock mode). */
export function isFirebaseConfigured(): boolean {
  return REQUIRED_VARS.every((key) => Boolean(import.meta.env[key]))
}

let app: FirebaseApp | null = null

function getApp(): FirebaseApp {
  if (app) return app
  const missing = REQUIRED_VARS.filter((key) => !import.meta.env[key])
  if (missing.length) {
    throw new Error(
      `Firebase is not configured. Missing env vars: ${missing.join(', ')}. ` +
        'Copy .env.example to .env.local and fill in your Firebase project config.',
    )
  }
  app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  })
  return app
}

/** Firebase Auth singleton. The SDK keeps the session in IndexedDB and
 *  refreshes the short-lived ID token (JWT) automatically — never persist
 *  tokens to localStorage yourself. */
export function firebaseAuth(): Auth {
  return getAuth(getApp())
}

/** Firestore singleton. */
export function firestoreDb(): Firestore {
  return getFirestore(getApp())
}
