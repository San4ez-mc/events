import { defineConfig, devices } from "@playwright/test";

/**
 * §99 — browser E2E. Runs against a live stack: `E2E_BASE_URL` defaults to a
 * local `next start`/`next dev` on :3000 that proxies /api to the API.
 * Mobile viewport project keeps the 390px layout honest (§102).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "uk-UA",
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-390", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
});
