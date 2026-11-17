import { defineConfig, devices } from '@playwright/test';

/** Integer 1-65535, otherwise the fallback. Mirrors server/src/config.ts parsePort. */
function parsePort(value: string | undefined, fallback: number): number {
  const raw = value?.trim() ?? '';
  const port = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return port >= 1 && port <= 65535 ? port : fallback;
}

// Separate from the dev/start default (3000) so e2e never talks to a server that is already running.
const port = parsePort(process.env['E2E_PORT'], 3100);
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
    // The production server (client + socket.io on one port). It serves the existing build: the
    // root `e2e` script builds first, and `verify` reuses the build it has just made.
    command: 'npm run serve -w @tincan/server',
    cwd: '..',
    url: `${baseURL}/healthz`,
    env: { PORT: String(port) },
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
