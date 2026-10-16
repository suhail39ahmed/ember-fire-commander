import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../pwa/api/types'
import { createMockSupervisorApi } from '../api/mock'
import type { Task, TaskDecision } from '../contracts'
import { fixture } from '../fixtures'
import { EditInstructionDialog } from '../detail/EditInstructionDialog'
import { editCopy } from '../detail/editCopy'
import { EDIT_MAX, editProblem, failureMessage, savedText, submitEdit } from '../detail/editModel'
import { TaskRow, type IncidentActions } from '../IncidentView'

const detail = fixture('conflict')
const verify = detail.tasks.find((t) => t.type === 'verify') as Task
const withdrawTask: Task = { ...verify, id: 't_w', type: 'withdraw', status: 'approved' }

function decision(task: Task, over: Partial<TaskDecision> = {}): TaskDecision {
  return { task, auditId: 'aud_7', ...over }
}

function dialog(over: Partial<Parameters<typeof EditInstructionDialog>[0]> = {}, lang: 'id' | 'en' = 'en') {
  return renderToStaticMarkup(
    <EditInstructionDialog
      lang={lang}
      task={verify}
      incident={detail.incident}
      editor="Bu Maya"
      volunteerName="Dedi"
      offline={false}
      send={async (text) => decision({ ...verify, instruction: text })}
      onSaved={() => undefined}
      onClose={() => undefined}
      {...over}
    />,
  )
}

describe('edit instruction: the dialog', () => {
  it('shows the current instruction, who it is for, and the frame’s note with the editor’s name', () => {
    const html = dialog()
    expect(html).toContain('Edit Dedi’s instruction')
    expect(html).toContain('Instruction shown and spoken to the volunteer')
    expect(html).toContain(verify.instruction as string)
    expect(html).toContain('Type, volunteer and incident stay the same. Saved as task.edit by Bu Maya. Approving is a separate step.')
    expect(html).toContain('>Cancel<')
    expect(html).toContain('>Save instruction<')
  })

  it('shows type, volunteer and incident as plain text, not fields', () => {
    const html = dialog()
    expect(html).toContain('<dt>Type</dt><dd>Verify</dd>')
    expect(html).toContain('<dt>Volunteer</dt><dd>Dedi</dd>')
    expect(html).toContain('Ketapang, Kalimantan Barat · Pak Dedi · #1')
    expect(html.match(/<textarea/g)).toHaveLength(1)
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<select')
  })

  it('keeps Save off until the text changes, and counts the characters', () => {
    const html = dialog()
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save instruction<\/button>/)
    expect(html).toContain(`${(verify.instruction as string).trim().length} / ${EDIT_MAX}`)
  })

  it('blocks Save while offline and says why', () => {
    expect(dialog({ offline: true })).toMatch(/<button[^>]*disabled=""[^>]*>/)
  })

  it('uses a short code, never a made-up name, when the API sent no name', () => {
    const html = dialog({ volunteerName: undefined })
    expect(html).toContain('Edit Volunteer DEDI’s instruction')
  })

  it('speaks Bahasa', () => {
    const html = dialog({}, 'id')
    expect(html).toContain('Ubah instruksi Dedi')
    expect(html).toContain('Disimpan sebagai task.edit oleh Bu Maya')
    expect(html).toContain('>Simpan instruksi<')
    expect(html).toContain('>Batal<')
  })

  it('leaves the name out of the note when there is none, instead of printing a blank', () => {
    const html = dialog({ editor: '' })
    expect(html).toContain('Saved as task.edit. Approving is a separate step.')
    expect(html).not.toContain('by </')
  })
})

describe('edit instruction: the rules', () => {
  it('finds blank, too long and unchanged text, counting the trimmed text', () => {
    expect(editProblem('   ', 'Old')).toBe('blank')
    expect(editProblem('x'.repeat(EDIT_MAX + 1), 'Old')).toBe('too_long')
    expect(editProblem(` ${'x'.repeat(EDIT_MAX)} `, 'Old')).toBeNull()
    expect(editProblem(' Old ', 'Old')).toBe('unchanged')
    expect(editProblem('New', null)).toBeNull()
  })

  it('writes only the trimmed text and reports the editor the route returned', async () => {
    const send = vi.fn(async (text: string) => decision({ ...verify, instruction: text }, { editedBy: 'Bu Maya' }))
    const result = await submitEdit(send, verify, '  Check the west ditch ', 'fallback', 'en')
    expect(send).toHaveBeenCalledWith('Check the west ditch')
    expect(result).toEqual({ ok: true, auditId: 'aud_7', editor: 'Bu Maya' })
  })

  it('falls back to the signed-in name when the route returns none', async () => {
    const result = await submitEdit(async (text) => decision({ ...verify, instruction: text }), verify, 'New text', 'Pak Yudi', 'en')
    expect(result).toMatchObject({ ok: true, editor: 'Pak Yudi' })
  })

  it('never sends blank or over-long text, or a WITHDRAW task', async () => {
    const send = vi.fn(async () => decision(verify))
    expect(await submitEdit(send, verify, '  ', '', 'en')).toEqual({ ok: false, message: 'Write the instruction. The old text stays.' })
    expect(await submitEdit(send, verify, 'x'.repeat(501), '', 'en')).toMatchObject({ ok: false, message: expect.stringContaining('500 characters at most') })
    expect(await submitEdit(send, withdrawTask, 'Stay', '', 'en')).toMatchObject({ ok: false, message: expect.stringContaining('WITHDRAW instruction') })
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    [new ApiError('network', 'Network error', null, true), verify, /Could not reach ember-api.*old text stays/],
    [new ApiError('conflict', 'A withdraw instruction cannot be edited', 409, false), withdrawTask, /WITHDRAW instruction.*can’t be edited.*old text stays/],
    [new ApiError('conflict', 'x', 409, false), verify, /can’t be edited now.*old text stays/],
    [new ApiError('validation_error', 'instruction is not valid', 400, false, { instruction: 'at most 500 characters' }), verify, /not accepted.*old text stays/],
    [new ApiError('forbidden', 'x', 403, false), verify, /cannot edit instructions/],
    [new ApiError('not_found', 'x', 404, false), verify, /no longer exists/],
    [new ApiError('internal', 'Firestore exploded', 500, true), verify, /could not save.*old text stays/],
    [new Error('boom'), verify, /could not save/],
  ])('explains a refused edit inline in plain words (%#)', async (error, task, expected) => {
    const result = await submitEdit(async () => { throw error }, { ...task, type: task.type }, 'New text', '', 'en')
    expect(result.ok).toBe(false)
    const message = (result as { message: string }).message
    expect(message).toMatch(expected)
    expect(message).not.toMatch(/\b(409|400|403|404)\b|HTTP|Firestore|validation_error|Error/)
    expect(failureMessage(error, task, 'id')).not.toBe(message)
  })

  it('writes the saved line with the editor and the audit id', () => {
    expect(savedText('en', 'Bu Maya', 'aud_7')).toBe('Instruction saved by Bu Maya · audit aud_7')
    expect(savedText('id', 'Bu Maya', 'aud_7')).toBe('Instruksi disimpan oleh Bu Maya · audit aud_7')
    expect(savedText('en', '', 'aud_7')).toBe('Instruction saved · audit aud_7')
  })

  it('has every label in both languages', () => {
    for (const [key, value] of Object.entries(editCopy)) {
      // The English suffix and the Bahasa one are allowed to be empty: the other language puts the name last.
      if (key === 'titleSuffix') continue
      expect(value.en, key).toBeTruthy()
      expect(value.id, key).toBeTruthy()
    }
  })
})

describe('edit instruction: where it opens', () => {
  const actions: IncidentActions = {
    busyId: null, outcomes: {}, onApprove: () => undefined, onReject: () => undefined, onVerify: () => undefined,
    saveEdit: async () => { throw new Error('not used') },
  }

  it('keeps Edit on a proposal and no longer draws an inline editor', () => {
    const html = renderToStaticMarkup(<ul><TaskRow task={verify} detail={detail} actions={actions} lang="en" editor="Bu Maya" /></ul>)
    expect(html).toContain('>Edit<')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('sup-edit')
  })

  it('offers no Edit on a WITHDRAW task', () => {
    const html = renderToStaticMarkup(<ul><TaskRow task={withdrawTask} detail={detail} actions={actions} lang="en" /></ul>)
    expect(html).not.toContain('>Edit<')
  })

  it('turns Edit off while offline', () => {
    const html = renderToStaticMarkup(<ul><TaskRow task={verify} detail={detail} actions={actions} lang="en" offline /></ul>)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Edit<\/button>/)
  })
})

describe('edit instruction: the mock route', () => {
  it('replaces only the instruction', async () => {
    const api = createMockSupervisorApi('sup_1', 'conflict', 0)
    const before = await api.getIncident('inc_demo_01')
    const task = before.tasks.find((t) => t.type === 'verify') as Task
    const result = await api.editTask(task.id, '  Check the west ditch  ')
    expect(result.task).toEqual({ ...task, instruction: 'Check the west ditch' })
    expect(result.auditId).toMatch(/^aud_/)
    expect(api.mock.audit.map((a) => a.action)).toEqual(['task.edit'])
  })

  it('refuses a WITHDRAW task and leaves its text', async () => {
    const api = createMockSupervisorApi('sup_1', 'withdraw', 0)
    const before = await api.getIncident('inc_demo_01')
    const task = before.tasks.find((t) => t.type === 'withdraw') as Task
    await expect(api.editTask(task.id, 'Stay')).rejects.toMatchObject({ status: 409 })
    expect((await api.getIncident('inc_demo_01')).tasks.find((t) => t.id === task.id)?.instruction).toBe(task.instruction)
  })
})
