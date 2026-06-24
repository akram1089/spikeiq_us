import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('react-router')) {
            return 'vendor-react'
          }
          if (id.includes('recharts') || id.includes('lightweight-charts')) {
            return 'vendor-charts'
          }
          if (id.includes('@mui') || id.includes('@emotion')) {
            return 'vendor-mui'
          }
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: ['spikeiq.chickenkiller.com', 'localhost'],
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
    allowedHosts: ['spikeiq.chickenkiller.com', 'localhost'],
  },
})
