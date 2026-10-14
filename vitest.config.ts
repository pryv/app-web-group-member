import { defineConfig } from "vitest/config";

/**
 * Unit tests only: `src/**`. The `e2e/` directory is Playwright's (`npm run e2e`).
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", "e2e"],
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
  },
});
