import { defineConfig } from 'vite'

// HustlyTasker landing — static cinematic microsite.
// Media (the 3 reference stills + the scroll-background mp4) live in public/media/
// and are served at the site root, so they are referenced as /media/... everywhere.
export default defineConfig({
  // Plain CSS only — provide an inline (empty) PostCSS config so Vite does NOT
  // walk up and inherit the parent Next.js app's Tailwind/PostCSS pipeline.
  css: {
    postcss: {},
  },
  // Keep the heavy media as real files (never inline as base64).
  build: {
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
  },
})
