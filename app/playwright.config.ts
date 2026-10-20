import { defineConfig } from '@playwright/test';

const port = 3100;

export default defineConfig({
  testDir: '.',
  testMatch: ['tests/**/*.spec.ts', 'cases/**/*.spec.ts'],
  reporter: process.env.CI ? [['list'], ['json', { outputFile: 'test-results/results.json' }]] : 'list',
  use: { baseURL: `http://localhost:${port}` },
  webServer: { command: 'node src/server.ts', port, reuseExistingServer: !process.env.CI },
});
