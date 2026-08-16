import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'client/index.html'),
        pricing: resolve(__dirname, 'client/pricing.html'),
        login: resolve(__dirname, 'client/login.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'client/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  plugins: [react()],
});