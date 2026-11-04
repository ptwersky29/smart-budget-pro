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
    expect(css).toContain(".penni-shared-backdrop { z-index: var(--penni-z-backdrop);");
    expect(css).toContain(".penni-v2.penni-menu-content { z-index: var(--penni-z-menu); }");
  });

  test("action toolbars cannot collapse underneath account summary cards", () => {
    const page = src("components/ui/page.jsx");
    const workspace = src("components/ui/workspace.jsx");
    const css = src("design-system/penni-reference.css");
    expect(page).toContain("penni-inner-page-header flex shrink-0");
    expect(workspace).toContain("min-h-10 shrink-0");
    expect(css).toContain("min-height:44px; flex-shrink:0;");
    expect(src("pages/AccountsPage.jsx")).toContain('className="penni-accounts-toolbar"');
  });
  test("transaction add control is one primary button plus a separate options menu", () => {
    const tx = src("pages/Transactions.jsx");
    expect(tx).toContain("penni-primary-action inline-flex");
    expect(tx).not.toContain('items-stretch overflow-hidden rounded-[10px] bg-emerald');
    expect(tx).toContain('aria-label="Transaction options"');
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
