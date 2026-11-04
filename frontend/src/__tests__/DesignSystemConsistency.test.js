const fs = require("fs");
const path = require("path");
const src = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

describe("Penni consistent workspace and overlay contracts", () => {
  test("Dashboard Accounts Transactions and Budgets share a contained workspace", () => {
    const app = src("pages/AppLayout.jsx");
    expect(app).toContain('FIXED_WORKSPACE_ROUTES = new Set(["/dashboard", "/accounts", "/transactions", "/budgets"])');
    expect(app).toContain("max-w-[var(--content-max)]");
    expect(app).not.toContain("key={location.pathname}");
  });

  test("short laptop screens retain the app shell unless excessively zoomed", () => {
    const css = src("index.css");
    expect(css).toContain("(min-height: 521px) and (max-height: 690px)");
    expect(css).toContain("(max-height: 520px)");
  });

  test("dashboard and accounts no longer reverse their contained overflow rules", () => {
    const css = src("design-system/penni-reference.css");
    expect(css).not.toMatch(/\.penni-v2 \.dashboard-reference,\s*\.penni-v2 \.accounts-workspace\s*\{\s*height:\s*auto/);
    expect(css).toContain(".penni-shared-backdrop { z-index: 9490; }");
    expect(css).toContain(".penni-v2.penni-menu-content { z-index: 10020; }");
  });

  test("select controls advertise listbox semantics and use usable popover widths", () => {
    const select = src("components/PenniSelect.jsx");
    const category = src("components/CategoryCombobox.jsx");
    expect(select).toContain('role="combobox"');
    expect(select).toContain('aria-expanded={open}');
    expect(select).toContain('role="listbox"');
    expect(category).toContain('w-[var(--radix-popover-trigger-width)]');
  });
});
