import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Strict CSP for the packaged app only; the dev server needs React Refresh's inline preamble.
const csp = {
  name: 'diskly-csp',
  apply: 'build',
  transformIndexHtml: html => html.replace('<meta charset="utf-8">',
    `<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'">`)
};

export default defineConfig({
  base: './',
  plugins: [react(), csp],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true }
});
