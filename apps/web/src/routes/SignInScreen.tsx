import { useState } from 'react'

import { useAuth } from '../auth/AuthProvider'
import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { AuthShell } from './AuthShell'
import { copy, signInErrorText } from './copy'
import type { Audience } from './paths'

/**
 * Sign-in for one page. It renders in place at /pwa or /console, so once the
 * account is ready the same route shows the page the user opened.
 */
export function SignInScreen({ audience }: { audience: Audience }) {
  const { lang } = useLanguage()
  const { status, message, signIn } = useAuth()
  const [pending, setPending] = useState(false)
  const busy = pending || status === 'loading'

  async function onGoogle() {
    setPending(true)
    try {
      await signIn()
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell audience={audience}>
      <div className="login-card">
        <h1>{t(lang, copy.signIn[audience].title)}</h1>
        <p className="sub">{t(lang, copy.signIn[audience].sub)}</p>
        <button className="google-button" type="button" onClick={onGoogle} disabled={busy} aria-busy={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          {t(lang, busy ? copy.signIn.busy : copy.signIn.button)}
        </button>
        {message ? <p className="error" role="alert">{signInErrorText(message, lang)}</p> : null}
        <p className="note">{t(lang, copy.signIn.note)}</p>
      </div>
    </AuthShell>
  )
}
