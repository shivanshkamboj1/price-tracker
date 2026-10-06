import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is parked: index.html is a static "domain for sale" page and the
// portfolio app (index.portfolio.html + src/) is kept but not published.
// To restore: swap index.portfolio.html back to index.html and set
// publicDir to 'public' so the resume and project art ship again.
export default defineConfig({
  base: './',
  publicDir: 'static',
  plugins: [react()],
  server: { port: 5173, open: true },
})
