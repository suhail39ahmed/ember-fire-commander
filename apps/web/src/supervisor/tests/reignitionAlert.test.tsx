import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { formatTime } from '../../pwa/formatTime'
import { ReignitionAlertBanner } from '../ReignitionAlert'
import type { ReignitionAlert } from '../chromeClient'

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'ready',
    user: null,
    me: { id: 'sup_1', displayName: 'Bu Maya', role: 'supervisor' as const },
    message: null,
    signIn: async () => undefined,
    signOut: async () => undefined,
    refreshMe: async () => undefined,
  }),
}))

const extinguishedAt = '2026-10-15T10:00:00.000Z'

function alert(over: Partial<ReignitionAlert> = {}): ReignitionAlert {
  return {
    id: 'alert_1',
    incidentId: 'inc_ext',
    code: null,
    distanceM: 140,
    extinguishedAt,
    message: 'New activity near an extinguished site. Re-inspect before any decision.',
    taskId: null,
    ...over,
  }
}

function html(props: Partial<ComponentProps<typeof ReignitionAlertBanner>> = {}) {
  return renderToStaticMarkup(
    <ReignitionAlertBanner
      alert={alert()}
      lang="en"
      onSent={() => undefined}
      onDismissed={() => undefined}
      {...props}
    />,
  )
}

describe('re-ignition alert', () => {
  it('shows the watch label, distance, empty code, and peat note from copy', () => {
    const markup = html()
    expect(markup).toContain('RE-IGNITION WATCH')
    expect(markup).toContain('140 m')
    expect(markup).toContain('from —')
    expect(markup).toContain(formatTime(extinguishedAt))
    expect(markup).toContain('Peat can smoulder underground for weeks')
    expect(markup).toContain('Send re-check task')
    expect(markup).toContain('Dismiss with reason')
    expect(markup).not.toContain('TOHOR')
    expect(markup).not.toContain('lead_')
    expect(markup).not.toContain('0.1')
  })

  it('renders nothing when the API returns null or the key is still loading', () => {
    expect(html({ alert: null })).toBe('')
    expect(html({ alert: undefined })).toBe('')
  })

  it('shows a stored site code when the API provides one', () => {
    expect(html({ alert: alert({ code: '#7' }) })).toContain('from #7')
  })

  it('hides Send and Dismiss after a re-check was sent', () => {
    const markup = html({ alert: alert({ taskId: 'task_recheck_1' }) })
    expect(markup).toContain('Re-check task is waiting for approval')
    expect(markup).not.toContain('Send re-check task')
    expect(markup).not.toContain('Dismiss with reason')
  })
})
