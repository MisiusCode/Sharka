import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    // PIN maiša skaičiuojama scrypt su N=2^17 (`core/pin.ts`) — sąmoningai brangu.
    // Vietoje tai keli šimtai ms, bet bendro naudojimo CI mašinoje
    // `tests/server/auth.test.ts` testai, maišantys kelis PIN, viršija numatytas 5 s.
    testTimeout: 20_000,
  },
});
