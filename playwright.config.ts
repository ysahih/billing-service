import { defineConfig } from "@playwright/test";

// Needs real Stripe TEST keys in .env and `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
// running, because the point of the test is that the webhook, not the redirect, activates the account.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
