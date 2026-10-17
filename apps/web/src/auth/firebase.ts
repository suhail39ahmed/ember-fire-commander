/// <reference types="vite/client" />
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, initializeAuth, browserSessionPersistence, browserPopupRedirectResolver } from 'firebase/auth'
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check'

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
}

export const firebaseApp: FirebaseApp = initializeApp(firebaseConfig)
// Opt-in for local multi-role demos: each tab keeps its own authenticated user.
// Production retains Firebase's normal persistent sign-in behavior.
export const auth = import.meta.env.DEV && import.meta.env.VITE_AUTH_SESSION_ONLY === 'true'
  ? initializeAuth(firebaseApp, { persistence: browserSessionPersistence, popupRedirectResolver: browserPopupRedirectResolver })
  : getAuth(firebaseApp)
export const googleProvider = new GoogleAuthProvider()

let appCheck: AppCheck | null = null

export function getAppCheck(): AppCheck | null {
  if (appCheck) {
    return appCheck
  }
  const siteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY
  if (!siteKey) {
    return null
  }
  if (import.meta.env.DEV) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true
  }
  appCheck = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  })
  return appCheck
}
