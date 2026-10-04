/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND = 'http://127.0.0.1:47600';

// Solo en desarrollo: scripts/dev.sh comparte el token de sesión con Vite (ADR-0003).
// En producción el servidor Java sustituye el marcador al servir la página.
function devToken(): Plugin {
  return {
    name: 'litedd-dev-token',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace('__LITEDD_TOKEN__', process.env.LITEDD_DEV_TOKEN ?? ''),
  };
}

export default defineConfig({
  plugins: [react(), devToken()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: BACKEND,
        // Host y Origin del backend para superar S-11 y S-13.
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => {
            if (req.getHeader('origin')) req.setHeader('origin', BACKEND);
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
