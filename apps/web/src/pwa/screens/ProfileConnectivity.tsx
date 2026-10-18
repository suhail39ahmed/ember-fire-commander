import { lazy, Suspense, useState } from 'react'

import { strings, t, type Lang } from '../i18n'
import { screenStrings } from './strings'

const TestPanel = lazy(() => import('../../livekit/LiveKitTestPanel'))

export function ProfileConnectivity({ lang }: { lang: Lang }) {
  const [active, setActive] = useState<'microphone' | 'camera' | null>(null)
  if (import.meta.env.VITE_LIVEKIT_TEST_ENABLED !== 'true') return null
  const copy = screenStrings.profile
  return <section className="perms profile-connectivity" aria-labelledby="connectivity-title">
    <div className="perms-heading"><h3 id="connectivity-title">{t(lang, copy.connectivity)}</h3></div>
    <ul>
      {(['microphone', 'camera'] as const).map((kind) => <li key={kind}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={kind === 'microphone'
            ? 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3'
            : 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'} />
        </svg>
        <div><span className="profile-connectivity-name">{t(lang, strings[kind])}</span>
          <p className="muted small">{t(lang, kind === 'microphone' ? copy.testAudio : copy.testVideo)}</p>
        </div>
        <button type="button" className="btn small secondary" aria-expanded={active === kind}
          aria-label={`${t(lang, active === kind ? copy.closeTest : copy.testCall)} · ${t(lang, strings[kind])}`}
          onClick={() => setActive(active === kind ? null : kind)}>
          {t(lang, active === kind ? copy.closeTest : copy.testCall)}
        </button>
      </li>)}
    </ul>
    {active && <Suspense fallback={<p role="status">{t(lang, screenStrings.common.loading)}</p>}>
      <TestPanel key={active} role="volunteer" initialVideo={active !== 'microphone'} variant="profile" />
    </Suspense>}
  </section>
}
