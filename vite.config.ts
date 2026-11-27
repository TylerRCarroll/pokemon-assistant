import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview, mode }) => {
  // `vite build --mode android` builds for the Capacitor app: served from the APK's root, no service worker
  const android = mode === 'android'
  // GitHub Pages serves the site from /pokemon-assistant/ (vite preview mirrors it); dev stays at the root
  const base = android ? '/' : command === 'build' || isPreview ? '/pokemon-assistant/' : '/'
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        disable: android,
        registerType: 'autoUpdate',
        includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-48.png'],
        manifest: {
          name: 'PokéPlanner',
          short_name: 'PokéPlanner',
          description: 'Team builder, planner, and matchup trainer for every gen plus Renegade Platinum and Unbound',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: base,
          scope: base,
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // the game data chunks (learnsets, usage stats) are large; cache them all for offline use
          globPatterns: ['**/*.{js,css,html,png,svg,json}'],
          maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
          navigateFallback: `${base}index.html`,
          runtimeCaching: [
            {
              // Showdown sprites: cache as they're seen so teams still show offline
              urlPattern: /^https:\/\/play\.pokemonshowdown\.com\/sprites\//,
              handler: 'CacheFirst',
              options: { cacheName: 'sprites', expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 90 } },
            },
          ],
        },
      }),
    ],
    // the battle simulation workers import the sim and its data in chunks, which needs module workers
    worker: { format: 'es' as const },
    // Showdown's battle save/restore (cloning for the advisor) writes references by class name
    // ("[Pokemon:p1a]"); minified class names ("[n:p1a]") don't restore, so keep them
    esbuild: { keepNames: true },
    server: {
      // raw romhack docs live here; spreadsheets open in Excel are locked and crash the watcher
      watch: { ignored: ['**/Documentation/**', '**/android/**'] },
    },
  }
})
