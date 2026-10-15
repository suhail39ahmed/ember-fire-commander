import type { ChipValue } from '../contracts/types'

/** Bahasa label for each chip. These are also the wire values, apart from `butuh_bantuan`. */
export const CHIP_ID_LABEL: Record<ChipValue, string> = {
  asap: 'asap',
  api: 'api',
  aman: 'aman',
  butuh_bantuan: 'butuh bantuan',
}
