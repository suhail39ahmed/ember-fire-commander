import { describe, expect, it, vi } from 'vitest'
import type { Me, MePatch } from '../../auth/api'
import type { EmberApi } from '../api/types'
import { createProfileSettings } from '../layout/profileSettings'
import { createLanguageStore } from '../language'

const me: Me = { id: 'one', displayName: 'Sari', role: 'volunteer', language: 'id', shareMyLocationWithCrew: true }
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
function setup(initial: Me = me, patchMe: EmberApi['patchMe'] = vi.fn(async (patch: MePatch) => ({ ...initial, ...patch }))) {
  const language = createLanguageStore()
  language.set('en')
  const settings = createProfileSettings(initial, { patchMe } as unknown as EmberApi, language.get(), language.set)
  const disconnect = settings.connect()
  return { language, settings, patchMe, disconnect }
}

describe('profile preferences', () => {
  it('applies the server language on sign-in without writing it back', () => {
    const { language, patchMe } = setup({ ...me, language: 'su' })
    expect(language.get()).toBe('su')
    expect(patchMe).not.toHaveBeenCalled()
  })
  it('keeps the device choice when the profile has no language', () => {
    const { language, patchMe } = setup({ ...me, language: null })
    expect(language.get()).toBe('en')
    expect(patchMe).not.toHaveBeenCalled()
  })
  it.each(['id', 'en', 'jv', 'su', 'ms'] as const)('saves %s from the common dropdown handler', async (next) => {
    const { language, settings, patchMe } = setup()
    settings.update({ language: next })
    expect(language.get()).toBe(next)
    await settle()
    expect(patchMe).toHaveBeenCalledWith({ language: next })
    expect(settings.get().me?.language).toBe(next)
    expect(settings.get().saving).toBe(false)
  })
  it('restores language and sharing after a failed save, including a missing server language', async () => {
    for (const initial of [me, { ...me, language: null }]) {
      const { language, settings } = setup(initial, vi.fn().mockRejectedValue(new Error('offline')))
      settings.update({ language: 'ms', shareMyLocationWithCrew: false })
      expect(language.get()).toBe('ms')
      expect(settings.get().me?.shareMyLocationWithCrew).toBe(false)
      await settle()
      expect(language.get()).toBe(initial.language ?? 'en')
      expect(settings.get().me?.shareMyLocationWithCrew).toBe(true)
      expect(settings.get().error).toBe(true)
    }
  })
  it('serializes rapid changes and rolls back to the last successful server value', async () => {
    let resolveFirst!: (value: Me) => void
    const patch = vi.fn().mockImplementationOnce(() => new Promise<Me>((resolve) => { resolveFirst = resolve })).mockRejectedValueOnce(new Error('offline'))
    const { settings, language } = setup(me, patch)
    settings.update({ language: 'jv' })
    settings.update({ language: 'ms' })
    expect(patch).toHaveBeenCalledTimes(1)
    expect(language.get()).toBe('ms')
    resolveFirst({ ...me, language: 'jv' })
    await settle()
    expect(patch).toHaveBeenCalledTimes(2)
    expect(language.get()).toBe('jv')
    expect(settings.get().me?.language).toBe('jv')
  })
  it('does not change another session language after unmount', async () => {
    let resolve!: (value: Me) => void
    const { settings, language, disconnect } = setup(me, vi.fn(() => new Promise<Me>((done) => { resolve = done })))
    settings.update({ language: 'jv' })
    disconnect()
    language.set('en')
    resolve({ ...me, language: 'jv' })
    await settle()
    expect(language.get()).toBe('en')
  })
})
