import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

import type { Plugin } from 'vite';

const proxyTarget = process.env.PLYM_API ?? 'http://localhost:8000';

/**
 * In dev the app is mounted at /admin/. Hitting the bare root (or /admin with
 * no trailing slash) otherwise shows Vite's "did you mean /admin/?" notice.
 * Redirect those to /admin/ so localhost:5173 just works.
 */
function adminRedirect(): Plugin {
  return {
    name: 'plym-admin-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '/';
        if (url === '/' || url === '/admin') {
          res.statusCode = 302;
          res.setHeader('Location', '/admin/');
          res.end();
          return;
        }
        next();
      });
    },
  };
}
const proxied = [
  '/api',
  '/blog',
  '/media',
  '/sitemap.xml',
  '/robots.txt',
  '/favicon.ico',
  '/logo.webp',
  '/webfonts',
  '/health',
];

export default defineConfig({
  base: '/admin/',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      proxied.map((p) => [p, { target: proxyTarget, changeOrigin: true }]),
    ),
  },
  build: {
    // CodeMirror language modes are split per-language and load on demand,
    // so the editor route stays lazy. Keep the common vendors in stable chunks.
    rollupOptions: {
      output: {
        manualChunks(id) {
          // CodeMirror core + language grammars are left alone so the editor
          // route stays lazy and each language mode keeps its own on-demand chunk.
          if (id.includes('node_modules')) {
            if (id.includes('@phosphor-icons')) return 'icons';
            if (id.includes('motion')) return 'motion';
            if (/[\\/]react(-dom|-router)?[\\/]/.test(id)) return 'react';
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
  plugins: [adminRedirect(), react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
