const { test, expect } = require("@playwright/test");
const { installApiMocks, users, validJwt } = require("./fixtures/mockApi");

const CACHED_PROFILE = {
  user_id: users.returningUser.user_id,
  email: users.returningUser.email,
  name: users.returningUser.name,
  role: users.returningUser.role,
  tier: users.returningUser.tier,
  onboarded: true,
  preferences: {},
};

async function seedSession(page) {
  await page.addInitScript(({ token, profile }) => {
    window.localStorage.setItem("access_token", token);
    window.localStorage.setItem("refresh_token", token);
    window.localStorage.setItem("penni.offline-profile.v1", JSON.stringify(profile));
  }, { token: validJwt({ sub: users.returningUser.user_id }), profile: CACHED_PROFILE });
}

test.describe("reliability on a bad network", () => {
  test("an API outage never shows demo balances to a real user", async ({ page }) => {
    await seedSession(page);
    await page.route("**/api/**", (route) => route.abort("failed"));

    await page.goto("/dashboard");

    // The error state must be honest, and none of the synthetic demo fixtures
    // (fake salary / demo account) may leak into a signed-in user's screen.
    await expect(page.getByTestId("dashboard-error")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Penni Demo Account")).toHaveCount(0);
    await expect(page.getByText("1,842.61")).toHaveCount(0);
  });

  test("the shell renders while session verification is still in flight", async ({ page }) => {
    await seedSession(page);
    await installApiMocks(page, { user: users.returningUser });

    // Load once so the lazy dashboard chunk is in this context's cache; the
    // assertion below is about auth, not about webpack compiling routes.
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-root")).toBeVisible({ timeout: 60_000 });

    // Registered after the catch-all mock, so it takes precedence.
    await page.route("**/api/auth/me", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(users.returningUser),
      });
    });

    const started = Date.now();
    await page.reload();
    await expect(page.locator("main")).toBeVisible({ timeout: 8_000 });

    // Cached-profile hydration means the shell does not wait on /auth/me,
    // which is held for 20s. 8s is generous for a reload and still proves the
    // shell renders long before auth resolves.
    expect(Date.now() - started).toBeLessThan(8_000);
  });

  test("every failed screen offers a retry instead of an endless skeleton", async ({ page }) => {
    await seedSession(page);
    await installApiMocks(page, { forceError: true });

    await page.goto("/dashboard");

    const error = page.getByTestId("dashboard-error");
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error.getByRole("button", { name: /retry|try again|reload/i })).toBeVisible();
  });
});
