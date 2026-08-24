import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Bind to all interfaces (not just localhost) so the dev server is
    // reachable from other devices on the LAN, e.g. testing from a phone.
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
    },
  },
})
