import { defineConfig } from 'vite';

export default defineConfig({
  // Single-page app served from project root.
  // Build output goes to dist/ — deploy that folder to any static host
  // (Vercel, Netlify, Cloudflare Pages) or open dist/index.html directly.
  root: '.',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100000000, // inline everything → optional single-file-ish output
  },
  server: {
    port: 5173,
    open: true,
  },
});
