import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://127.0.0.1:8099' },
  webServer: {
    command: 'npm run build:ui && npm run start:test',
    url: 'http://127.0.0.1:8099',
    reuseExistingServer: false,
  },
});
