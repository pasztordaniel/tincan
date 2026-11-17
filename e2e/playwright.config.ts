import { defineConfig, devices } from '@playwright/test';

// Separate from the dev default (3000) so e2e never talks to a running dev server.
const port = Number(process.env['E2E_PORT'] ?? 3100);
const baseURL = `http://localhost:${port}`;
const isCI = Boolean(process.env['CI']);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The production path: build everything, serve client + socket.io from one Node process.
    command: 'npm start',
    cwd: '..',
    url: `${baseURL}/healthz`,
    env: { PORT: String(port) },
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
