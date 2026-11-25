import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // raw romhack docs live here; spreadsheets open in Excel are locked and crash the watcher
    watch: { ignored: ['**/Documentation/**'] },
  },
})
