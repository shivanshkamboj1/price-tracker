import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // `''` loads every variable, not just the VITE_ prefixed ones, so the dev
  // proxy target can be set without exposing it to the bundle.
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      // The SPA talks to /api on its own origin and Vite forwards to the API
      // server, so cookies stay first-party in development exactly as in production.
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:4000',
          changeOrigin: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
          },
        },
      },
    },
  };
});
