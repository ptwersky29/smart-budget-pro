const { test, expect } = require("@playwright/test");
const { installApiMocks } = require("./fixtures/mockApi");

const tx = (id, date, description, merchant, amount, category, approval = "unapproved", extra = {}) => ({
  transaction_id: id,
  date,
  description,
  merchant,
  normalized_merchant: merchant,
  amount,
  category,
  approval_status: approval,
  category_approval_status: approval,
  is_income: amount > 0,
  is_transfer: false,
  source: "manual",
  source_label: "Barclays",
  institution: "Barclays",
  account_id: "acct_main",
  currency: "GBP",
  created_at: `${date}T15:24:00Z`,
  ...extra,
});

const rows = [
  tx("t1", "2026-10-20", "TFL TRAVEL CH ON 20 OCT CLP", "Transport for London", -1.75, "public_transport"),
  tx("t2", "2026-10-20", "Lycamobile ON 20 OCT BCC", "Lycamobile", -5, "mobile_phone"),
  tx("t3", "2026-10-20", "4532 16OCT26 C AMUD HATZD...", "Amud Hatzdokh", -36, "other_charity"),
  tx("t4", "2026-10-19", "HYPE ON 18 OCT CLP", "Hype", -4.54, "groceries"),
  tx("t5", "2026-10-15", "TFL TRAVEL CH ON 13 OCT CLP", "Transport for London", -3.5, "public_transport"),
  tx("t6", "2026-10-13", "TFL TRAVEL CH ON 13 OCT CLP", "Transport for London", -1.75, "public_transport"),
  tx("t7", "2026-10-13", "Indigs Bakery ON 12 OCT CLP", "Indigs Bakery", -5.8, "takeaway"),
  tx("t8", "2026-10-12", "TKMAXX_UK ON 11 OCT CLP", "TK Maxx", -24.99, "house_supplies"),
  tx("t9", "2026-10-12", "Tesco Superstore", "Tesco", -28, "groceries", "approved"),
  tx("t10", "2026-10-11", "Greatview Rent", "Rent Payment", -1250, "rent", "approved", { source_label: "Yordex", institution: "Yordex" }),
  tx("t11", "2026-10-10", "EDF Energy", "Electricity", -62.4, "utilities", "approved", { source_label: "Reisy TSB", institution: "Reisy TSB" }),
  tx("t12", "2026-10-10", "Salary", "Employer", 2300, "income", "approved"),
];

test("transactions visual", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.clock.setFixedTime(new Date("2026-10-20T12:00:00Z"));
  await installApiMocks(page);
  await page.route("**/api/transactions?*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        transactions: rows,
        total: rows.length,
        income_total: 2300,
        expense_total: 1422.73,
      }),
    });
  });
  await page.goto("/transactions");
  await expect(page.getByTestId("transactions-root")).toBeVisible();
  await page.waitForTimeout(900);
  console.log(await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollHeight: document.documentElement.scrollHeight,
      sidebar: rect("aside[data-tour='sidebar']"),
      header: rect("header[data-tour='route-header']"),
      main: rect("main[data-tour='main-content']"),
      title: rect("[data-testid='transactions-root'] h1"),
      root: rect("[data-testid='transactions-root']"),
      table: rect("[data-testid='transactions-root'] table"),
      inspector: rect("[data-testid='transactions-root'] aside.sticky"),
    };
  }));
  await page.screenshot({ path: "C:/Users/PC/AppData/Local/Temp/opencode/tx-desktop.png" });
  await page.getByLabel("Select TFL TRAVEL CH ON 20 OCT CLP").check();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "C:/Users/PC/AppData/Local/Temp/opencode/tx-selected.png", fullPage: true });
});
