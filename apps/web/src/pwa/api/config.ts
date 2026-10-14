/** Runtime config read from Vite env. Only public values belong here. */
const env = import.meta.env

export const API_BASE_URL: string = (
  env.VITE_API_BASE_URL || env.VITE_EMBER_API_URL || 'http://localhost:8080'
).replace(/\/+$/, '')

export const GATEWAY_WSS_URL: string = (env.VITE_VOICE_GATEWAY_WSS_URL || '').replace(/\/+$/, '')

/** The in-browser mock API is used only when VITE_USE_MOCK_API is exactly "true". */
export const USE_MOCK_API: boolean = env.VITE_USE_MOCK_API === 'true'
