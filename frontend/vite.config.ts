import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawApiTarget = env.VITE_API_BASE_URL || 'https://cgr-platform.abogado.workers.dev'
  const apiTarget = rawApiTarget.replace('.worker.dev', '.workers.dev')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      }
    }
  }
})
