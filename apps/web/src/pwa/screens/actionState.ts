/** Where a one-tap action to ember-api stands. `failed` keeps the screen as it was and lets the volunteer try again. */
export type ActionState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'failed' }
