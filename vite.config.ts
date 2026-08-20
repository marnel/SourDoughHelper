import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Served from a domain root (Netlify / Vercel / own domain), so base and the
// service-worker scope are both '/'.
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The app is fully offline-capable: everything is precached and any
        // unknown navigation falls back to the shell.
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Sourdough Helper',
        short_name: 'Sourdough',
        description:
          'Starter feeding ratios, bake schedules and timers for sourdough bread.',
        // Static launch colours: these match the default Slate palette in
        // light mode, since a manifest cannot follow the in-app theme.
        theme_color: '#f6f7f9',
        background_color: '#f6f7f9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['food', 'lifestyle', 'utilities'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        // Lets you exercise install + offline behaviour with `npm run dev`.
        enabled: true,
        type: 'module',
      },
    }),
  ],
})
