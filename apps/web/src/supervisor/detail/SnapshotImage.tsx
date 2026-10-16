import { useEffect, useRef, useState } from 'react'

import { t, type Lang } from '../../pwa/i18n'
import type { PhotoUrl } from '../contracts'
import { photoCopy } from './instructionCopy'

type State = { kind: 'loading' } | { kind: 'ready'; url: string } | { kind: 'failed' }

/**
 * One photo report. It asks ember-api for a short-lived read link once, when it appears, and shows the image from
 * it. If the link cannot be had, it says so in place and shows no picture.
 */
export function SnapshotImage({ lang, observationId, load }: { lang: Lang; observationId: string; load: (observationId: string) => Promise<PhotoUrl> }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  // The loader can change on every render of the screen; one read per photo is enough.
  const loader = useRef(load)
  loader.current = load
  useEffect(() => {
    let live = true
    loader.current(observationId).then(
      (result) => { if (live) setState({ kind: 'ready', url: result.url }) },
      () => { if (live) setState({ kind: 'failed' }) },
    )
    return () => { live = false }
  }, [observationId])
  if (state.kind === 'ready') return <img className="pop-snap-img" src={state.url} alt={t(lang, photoCopy.alt)} loading="lazy" />
  return (
    <span className="pop-snap-img" role={state.kind === 'failed' ? 'alert' : 'status'}>
      {state.kind === 'failed' ? t(lang, photoCopy.failed) : t(lang, photoCopy.loading)}
    </span>
  )
}
