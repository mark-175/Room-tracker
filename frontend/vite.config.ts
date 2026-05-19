import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: `npm run dev` serves the UI on :5173 and proxies /api to the FastAPI
// server (run `python main.py` separately on :3000), so the app behaves
// exactly like production where FastAPI serves the built files itself.
// Prod: `npm run build` emits to ../frontend/dist, which main.py mounts.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
