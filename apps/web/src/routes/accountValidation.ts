export function normalizeE164Phone(value: string): string {
  return value.replace(/[\s().-]/g, '')
}

export function isE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalizeE164Phone(value))
}
