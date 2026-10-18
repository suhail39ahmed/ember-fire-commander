import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  // Only this public test flag is shared from the root staging .env.
  // All existing app env handling stays with Vite; server keys never enter the bundle.
  define: {
    'import.meta.env.VITE_LIVEKIT_TEST_ENABLED': JSON.stringify(
      process.env.VITE_LIVEKIT_TEST_ENABLED
      ?? loadEnv(mode, process.cwd(), 'VITE_LIVEKIT_TEST_ENABLED').VITE_LIVEKIT_TEST_ENABLED
      ?? loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), 'VITE_LIVEKIT_TEST_ENABLED').VITE_LIVEKIT_TEST_ENABLED
      ?? 'false',
    ),
  },
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts:['0.0.0.0', '127.0.0.1', 'localhost']
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor code changes far less often than app code, so keeping it in its own
        // hashed files lets returning visitors reuse them from cache after a deploy.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // Messaging (and the installations SDK only it needs) is imported on demand for push,
          // so it stays out of the vendor chunk and loads in its own file.
          if (id.includes('messaging') || id.includes('installations')) return undefined
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase'
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react'
          return undefined
        },
      },
    },
  },
}))
