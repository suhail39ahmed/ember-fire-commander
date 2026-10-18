/** Message the service worker posts to an open page when a notification is tapped. */
export const PUSH_CLICK = 'ember-push-click'

/** The data map ember-api puts on a push (shared contract, notifications): ids and the task type only. */
export interface PushData {
  taskId?: string
  callId?: string
  incidentId?: string
  type?: string
}

/**
 * Where a tapped push goes. A WITHDRAW push opens the app root, where the WITHDRAW screen covers everything as
 * soon as the digest loads; `?push=withdraw` marks it. Any other task push opens that task. A push with no task
 * id opens the Home screen. public/sw.js keeps a copy of this rule, and serviceWorkerPush.test.ts checks that
 * the two agree.
 */
export function pushPath(data: PushData | null | undefined): string {
  if (data?.type === 'withdraw') return '/pwa?push=withdraw'
  if (data?.type === 'call' && typeof data.callId === 'string' && /^[a-f0-9]{64}$/.test(data.callId)) return `/pwa?call=${data.callId}`
  const id = typeof data?.taskId === 'string' ? data.taskId.trim() : ''
  return id ? `/pwa/task/${encodeURIComponent(id)}` : '/pwa'
}
