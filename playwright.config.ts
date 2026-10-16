import { defineConfig } from "@playwright/test";

// Local: needs real Stripe TEST keys in .env and `stripe listen` running, because the point of
// the test is that the webhook, not the redirect, activates the account.
// Deployed: E2E_BASE_URL=https://… runs against that deployment and its own webhook endpoint.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev", url: "http://localhost:3000/health", reuseExistingServer: true, timeout: 120_000 },
});
