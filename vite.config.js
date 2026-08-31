import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app builds to /dist (served at "/"), and the /api/*.js files run as
// Vercel serverless functions on the same origin — so the frontend calls
// /api/quotes, /api/news and /api/ai with plain relative URLs, no CORS.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
