import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Homepage-only React build (Phase 1). Source lives in client/, output goes to
// dist/ at the repo root; server.js serves dist/index.html for "/" and falls
// back to public/ for every other page.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  publicDir: false,
  resolve: {
    alias: { '@': path.resolve(__dirname, 'client/src') }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/js': 'http://localhost:3000',
      '/css': 'http://localhost:3000',
      '/fonts': 'http://localhost:3000',
      '/manifest.json': 'http://localhost:3000',
      '/favicon.svg': 'http://localhost:3000',
      '/sw.js': 'http://localhost:3000'
    }
  }
});
