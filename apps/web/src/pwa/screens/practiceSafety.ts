import type { Localized, PracticeResponse } from '../contracts/types'

/** Authored safety copy; model output can select a rule, never rewrite it. */
export const practiceSafety: Record<NonNullable<PracticeResponse['ruleKey']>, Localized> = {
  withdraw: {
    en: 'This is the WITHDRAW rule. At a real fire EMBER tells you this on its own and alerts Bu Maya. You never need permission to leave.',
    id: 'Ini aturan WITHDRAW. Di kebakaran nyata EMBER memberi tahu Anda dan Bu Maya secara otomatis. Anda tidak perlu izin untuk pergi.',
  },
  upwind: { en: 'Stay on the upwind side, out of the smoke. Leave if conditions change.', id: 'Tetap di sisi datang angin, di luar asap. Pergi jika kondisi berubah.' },
  report: { en: 'Report from a safe distance. At a real fire, tap Report.', id: 'Lapor dari jarak aman. Di kebakaran nyata, ketuk Lapor.' },
}
