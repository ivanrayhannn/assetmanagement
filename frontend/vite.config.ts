/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' agar build bisa disajikan dari sub-path (GitHub Pages /<repo>/ maupun IIS virtual directory).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // mode http: teruskan /api ke AMS API lokal
    proxy: { '/api': 'http://localhost:5080' },
  },
  test: {
    environment: 'node',
  },
});
