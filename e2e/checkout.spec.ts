import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E, "Set E2E=1 with Stripe test keys and `stripe listen` running");

test("pricing → checkout → webhook → account shows active", async ({ page }) => {
  const email = `e2e+${Date.now()}@example.com`;

  await page.goto("/login?next=/pricing");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/pricing/);

  await page.getByTestId("subscribe-pro").click();

  // Stripe-hosted Checkout (test mode).
  await page.waitForURL(/checkout\.stripe\.com/);
  await page.locator("#cardNumber").fill("4242 4242 4242 4242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("E2E Test");
  const postal = page.locator("#billingPostalCode");
  if (await postal.isVisible().catch(() => false)) await postal.fill("10001");
  await page.locator("button[type=submit]").click();

  // Back on our success page: it polls until the webhook has written the subscription.
  await page.waitForURL(/\/checkout\/success/, { timeout: 60_000 });
  await expect(page.getByTestId("subscription-status")).toHaveText("active", { timeout: 60_000 });

  await page.goto("/account");
  await expect(page.getByTestId("subscription-status")).toHaveText("active");
  await expect(page.getByText("Pro")).toBeVisible();
});
