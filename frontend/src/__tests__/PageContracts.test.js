const fs = require("fs");
const path = require("path");

describe("page contracts", () => {
  test("subscriptions imports the shared page toolbar it renders", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "pages", "Subscriptions.jsx"),
      "utf8"
    );

    expect(source).toContain("PageToolbar");
    expect(source).toMatch(/import\s+\{[^}]*PageToolbar[^}]*\}\s+from\s+["']\.\.\/components\/ui\/layout["']/);
  });

  test("budgets sets a specific browser title", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "pages", "BudgetPage.jsx"),
      "utf8"
    );

    expect(source).toContain('document.title = "Budgets | Penni"');
  });

  test("core desktop workspaces stay fixed at normal laptop viewport heights", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf8");
    const layout = fs.readFileSync(path.join(__dirname, "..", "pages", "AppLayout.jsx"), "utf8");

    expect(layout).toContain('FIXED_WORKSPACE_ROUTES = new Set(["/dashboard", "/accounts", "/transactions", "/budgets"])');
    expect(layout).toContain("workspace-main lg:overflow-hidden");
    expect(css).toMatch(/@media \\(min-width: 1024px\\) and \\(min-height: 521px\\) and \\(max-height: 690px\\)/);
    expect(css).toMatch(/@media \\(min-width: 1024px\\) and \\(max-height: 520px\\)/);
    expect(css).toContain(".transaction-table-scroll");
    expect(css).toContain(".budget-ledger-scroll");
    expect(css).toContain(".account-detail-list");
  });

  test("account form modal exposes dialog semantics", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "components", "AccountFormModal.jsx"),
      "utf8"
    );

    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-labelledby="account-form-title"');
  });
});
