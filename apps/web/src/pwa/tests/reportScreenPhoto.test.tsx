import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { openCapture } from '../photo/capture'
import { fakeBrowser, outboxHandle, volunteerValue } from './volunteerKit'
import { VolunteerContext } from '../layout/volunteerContext'
import { LanguageProvider } from '../LanguageProvider'
import { ReportScreen } from '../screens/ReportScreen'

// The existing photo flow must stay as it is: ReportScreen gives PhotoPanel the same props as before, plus one hook
// that releases the live camera just before the phone's camera app or picker opens.
const photoProps: Array<Record<string, unknown>> = []
vi.mock('../photo/PhotoPanel', () => ({
  PhotoPanel: (props: Record<string, unknown>) => {
    photoProps.push(props)
    return null
  },
}))
const camera = { state: 'on', stream: null, start: vi.fn(), stop: vi.fn(), toggle: vi.fn() }
vi.mock('../camera/useLiveCamera', () => ({ useLiveCamera: () => camera }))

fakeBrowser()

function renderScreen(value = volunteerValue({ outbox: outboxHandle() })) {
  photoProps.length = 0
  renderToStaticMarkup(
    <LanguageProvider>
      <VolunteerContext.Provider value={value}>
        <StaticRouter location="/pwa/report">
          <ReportScreen />
        </StaticRouter>
      </VolunteerContext.Provider>
    </LanguageProvider>,
  )
  return photoProps[0]
}

beforeEach(() => {
  camera.stop.mockClear()
  camera.start.mockClear()
})

describe('live camera and the existing photo flow', () => {
  it('passes PhotoPanel the same props as before, so capture, upload and report sending are unchanged', () => {
    const value = volunteerValue({ outbox: outboxHandle() })
    const props = renderScreen(value)
    expect(props.api).toBe(value.api)
    expect(props.upload).toBe(value.upload)
    expect(props.submit).toBe(value.outbox.submit)
    expect(props.queuePhoto).toBe(value.outbox.queuePhoto)
    expect(props.lang).toBe('id')
    expect(typeof props.getPosition).toBe('function')
  })

  it('releases the live camera when Take photo is used', () => {
    const props = renderScreen()
    expect(typeof props.onBeforeCapture).toBe('function')
    expect(camera.stop).not.toHaveBeenCalled()
    ;(props.onBeforeCapture as () => void)()
    expect(camera.stop).toHaveBeenCalledTimes(1)
  })

  it('opens the camera app or picker only after the preview let go, and still opens if the release fails', () => {
    const calls: string[] = []
    openCapture(() => calls.push('open'), () => calls.push('release'))
    expect(calls).toEqual(['release', 'open'])

    const open = vi.fn()
    expect(() =>
      openCapture(open, () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(open).toHaveBeenCalledTimes(1)

    const plain = vi.fn()
    openCapture(plain)
    expect(plain).toHaveBeenCalledTimes(1)
  })
})

describe('camera permission', () => {
  it('does not open the camera on its own when the permission is still a prompt (renders only; effects do not run)', () => {
    renderScreen()
    expect(camera.start).not.toHaveBeenCalled()
  })
})
