const { test, expect } = require("@playwright/test");
const { installApiMocks, users, validJwt } = require("./fixtures/mockApi");

async function authenticate(page, user = users.returningUser) {
  await page.addInitScript(({ token }) => {
    window.localStorage.setItem("access_token", token);
    window.localStorage.setItem("refresh_token", token);
  }, { token: validJwt({ sub: user.user_id }) });
  await installApiMocks(page, { user });
}

test.describe("100k-user route and flow readiness", () => {
  test("new user can register and is routed into onboarding", async ({ page }) => {
    await installApiMocks(page, { user: users.newUser });
    await page.goto("/register");
    await page.getByLabel(/full name/i).fill("New User");
    await page.getByLabel(/email address/i).fill("new@example.com");
    await page.getByLabel(/^password/i).fill("StrongPass1!");
    await page.getByLabel(/confirm password/i).fill("StrongPass1!");
    await page.getByLabel(/privacy policy/i).check();
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("returning user can navigate core product pages and sign out", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 1024) <= 600, "desktop sidebar journey is covered in desktop project");
    await authenticate(page);
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-root")).toBeVisible();
    await page.getByTestId("nav-accounts-&-import").click();
    await expect(page).toHaveURL(/\/accounts/);
    await page.getByTestId("nav-transactions").click();
    await expect(page).toHaveURL(/\/transactions/);
    await page.getByTestId("nav-budgets").click();
    await expect(page).toHaveURL(/\/budgets/);
    await page.goBack();
    await expect(page).toHaveURL(/\/transactions/);
    await page.reload();
    await expect(page).toHaveURL(/\/transactions/);
    await page.getByTestId("logout-button").click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("power user interactions do not break route state", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 1024) <= 600, "desktop command palette journey is covered in desktop project");
    await authenticate(page);
    await page.goto("/dashboard");
    await page.getByTestId("command-open").click();
    await expect(page.getByPlaceholder(/search navigation/i)).toBeVisible();
    await page.keyboard.press("Escape");
    for (const path of ["/transactions", "/budgets", "/reports", "/accounts", "/settings", "/dashboard"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("error-prone user sees human feedback when APIs fail", async ({ page }) => {
    await page.addInitScript(({ token }) => window.localStorage.setItem("access_token", token), { token: validJwt() });
    await installApiMocks(page, { forceError: true });
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-error")).toContainText(/could not load dashboard|try again/i);
  });

  test("mobile user can use bottom navigation on a slow network", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 1024) > 600, "bottom navigation is only visible on mobile widths");
    await authenticate(page);
    await installApiMocks(page, { latency: 150 });
    await page.goto("/dashboard");
    await page.getByRole("tab", { name: /accounts/i }).click();
    await expect(page).toHaveURL(/\/accounts/);
    await page.getByRole("tab", { name: /transactions/i }).click();
    await expect(page).toHaveURL(/\/transactions/);
    await page.getByRole("tab", { name: /budgets/i }).click();
    await expect(page).toHaveURL(/\/budgets/);
  });
});
