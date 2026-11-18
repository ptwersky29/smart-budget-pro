const { test } = require("@playwright/test");
const { installApiMocks, users, validJwt } = require("./fixtures/mockApi");

/**
 * CRA compiles each lazy route chunk on first request. Without a warm-up the
 * first test to open the dashboard pays that cost inside its own timing
 * budget, which makes load-time assertions flaky on a cold runner.
 *
 * This setup project renders the authenticated dashboard once so every later
 * project starts from a compiled bundle.
 */
test("compile the authenticated dashboard bundle", async ({ page }) => {
  test.setTimeout(180_000);

  await page.addInitScript(({ token, profile }) => {
    window.localStorage.setItem("access_token", token);
    window.localStorage.setItem("refresh_token", token);
    window.localStorage.setItem("penni.offline-profile.v1", JSON.stringify(profile));
  }, {
    token: validJwt({ sub: users.returningUser.user_id }),
    profile: {
      user_id: users.returningUser.user_id,
      email: users.returningUser.email,
      name: users.returningUser.name,
      role: users.returningUser.role,
      tier: users.returningUser.tier,
      onboarded: true,
      preferences: {},
    },
  });
  await installApiMocks(page, { user: users.returningUser });

  await page.goto("/dashboard");
  await page.getByTestId("dashboard-root").waitFor({ timeout: 120_000 });
});
