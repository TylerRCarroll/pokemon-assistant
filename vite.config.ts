import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the site from /pokemon-assistant/ (vite preview mirrors it); dev stays at the root
  base: command === 'build' || isPreview ? '/pokemon-assistant/' : '/',
  plugins: [react()],
  server: {
    // raw romhack docs live here; spreadsheets open in Excel are locked and crash the watcher
    watch: { ignored: ['**/Documentation/**'] },
  },
}))
