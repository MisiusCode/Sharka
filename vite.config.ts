import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/ui',
  plugins: [react()], // be šito JSX neišsiverčia ir `npm run build:ui` lūžta
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        board: resolve('src/ui/index.html'),
        quickAdd: resolve('src/ui/quick-add/index.html'),
        alarm: resolve('src/ui/alarm/index.html'),
        digest: resolve('src/ui/digest/index.html'),
        settings: resolve('src/ui/settings/index.html'),
      },
    },
  },
  // IPv4 tiesiogiai, ne „localhost": serveris klausosi tik 127.0.0.1, o
  // Windows „localhost" dažnai pirma išsprendžia į ::1 — tada proxy priklausytų
  // nuo Node autoSelectFamily numatytosios reikšmės vietoj tiesioginio adreso.
  server: { proxy: { '/api': 'http://127.0.0.1:8080' } },
});
