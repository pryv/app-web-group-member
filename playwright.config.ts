import { defineConfig, devices } from "@playwright/test";

/**
 * Hermetic E2E: boots the Vite dev server and runs Chromium against it. Every
 * Pryv endpoint is MOCKED with `context.route(...)` (see e2e/mockPlatform.ts);
 * anything not mocked is aborted, so the suite never reaches the network.
 *
 * `E2E_PORT` (default 5183) moves the dev server, so several checkouts can run
 * the suite at once. The server is started with `--strictPort`.
 */
const PORT = Number(process.env.E2E_PORT ?? 5183);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    locale: "en-US",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
