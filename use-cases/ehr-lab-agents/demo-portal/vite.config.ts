import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the portal proxies to the integration and the lab simulator on their host ports;
// in the container, nginx does the same (see nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:9090',
      '/lab-api': { target: 'http://localhost:9093', rewrite: (path) => path.replace(/^\/lab-api/, '/lab') },
    },
  },
})
