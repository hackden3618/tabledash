import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Serve index.html for all routes (SPA mode) — required so /kitchen
  // doesn't 404 on direct navigation or page refresh.
  appType: 'spa',
})

