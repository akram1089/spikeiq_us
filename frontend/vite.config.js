import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['spikeiq.mooo.com', 'localhost'],
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: ['spikeiq.mooo.com', 'localhost'],
  },
})
