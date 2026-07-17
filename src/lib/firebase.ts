// Firebase bootstrap. Config comes from VITE_FIREBASE_* env vars when set,
// falling back to Merid's public project identifiers so the login/deck
// features never silently vanish on a deploy where the env config is missing
// or incomplete (which previously hid the whole auth UI).
//
// The web config is not a secret - these same identifiers ship in the
// extension (merid-extension-final/lib/firebase-config.js). Firestore security
// rules and API-key referrer restrictions are what actually protect user data
// (docs/FIREBASE_SETUP.md).
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

/** Public project identifiers (NOT secrets - see header). */
const FALLBACK_CONFIG = {
  apiKey: 'AIzaSyDTGSltJ0fWy7K-oKqDQA-N-02_B6Ys-Xg',
  authDomain: 'merid-49dd5.firebaseapp.com',
  projectId: 'merid-49dd5',
} as const

/** Env-first, fallback second. Only apiKey/authDomain/projectId are needed
 *  for auth + Firestore; the other VITE_FIREBASE_* vars are passed through
 *  when present but no longer gate the feature. */
function resolveConfig() {
  const env = import.meta.env
  const config: Record<string, string> = {
    apiKey: env.VITE_FIREBASE_API_KEY || FALLBACK_CONFIG.apiKey,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || FALLBACK_CONFIG.authDomain,
    projectId: env.VITE_FIREBASE_PROJECT_ID || FALLBACK_CONFIG.projectId,
  }
  if (env.VITE_FIREBASE_STORAGE_BUCKET) config.storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET
  if (env.VITE_FIREBASE_MESSAGING_SENDER_ID) config.messagingSenderId = env.VITE_FIREBASE_MESSAGING_SENDER_ID
  if (env.VITE_FIREBASE_APP_ID) config.appId = env.VITE_FIREBASE_APP_ID
  return config
}

/** True when a usable config exists. With the public fallback in place this
 *  is effectively always true; it stays as the single switch for building a
 *  fully local-only variant (blank out FALLBACK_CONFIG to use it). */
export function isFirebaseConfigured(): boolean {
  const c = resolveConfig()
  return Boolean(c.apiKey && c.projectId && c.authDomain)
}

let app: FirebaseApp | null = null

function getApp(): FirebaseApp {
  if (app) return app
  app = initializeApp(resolveConfig())
  return app
}

/** Firebase Auth singleton. The SDK keeps the session in IndexedDB and
 *  refreshes the short-lived ID token (JWT) automatically, so never persist
 *  tokens to localStorage yourself. */
export function firebaseAuth(): Auth {
  return getAuth(getApp())
}

/** Firestore singleton. */
export function firestoreDb(): Firestore {
  return getFirestore(getApp())
}
