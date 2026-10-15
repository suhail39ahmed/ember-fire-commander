import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
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
})
