import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The patient app's mode and SMART on FHIR settings: ../config/patient-auth.json, read on each request so
// scripts/patient-app-mode.sh takes effect on the next page load. The container's nginx serves the same file
// (docker-compose.yml mounts it). Missing file → 404 → the app runs in normal mode.
const patientAuthConfig = (): Plugin => ({
  name: 'patient-auth-config',
  configureServer(server) {
    server.middlewares.use('/patient-auth.json', (_req, res) => {
      try {
        const body = readFileSync(new URL('../config/patient-auth.json', import.meta.url))
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(body)
      } catch {
        res.statusCode = 404
        res.end()
      }
    })
  },
})

// In development the portal proxies to the integration and the lab simulator on their host ports;
// in the container, nginx does the same (see nginx.conf).
export default defineConfig({
  plugins: [react(), patientAuthConfig()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:9090',
      '/lab-api': { target: 'http://localhost:9093', rewrite: (path) => path.replace(/^\/lab-api/, '/lab') },
    },
  },
})
