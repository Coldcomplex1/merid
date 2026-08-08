import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // api/blog-render.js reads this to find the hashed stylesheet, so blog pages
    // link the same CSS file the app does instead of guessing at its name.
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep the Firebase SDK out of the app chunk so the landing page JS
          // stays small and the SDK caches independently across deploys.
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
  },
})
