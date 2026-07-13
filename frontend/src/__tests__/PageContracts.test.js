const fs = require("fs");
const path = require("path");

describe("page contracts", () => {
  test("subscriptions imports the shared page header it renders", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "pages", "Subscriptions.jsx"),
      "utf8"
    );

    expect(source).toContain("PageHeader");
    expect(source).toMatch(/import\s+\{[^}]*PageHeader[^}]*\}\s+from\s+["']\.\.\/components\/ui\/layout["']/);
  });

  test("budgets sets a specific browser title", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "pages", "BudgetPage.jsx"),
      "utf8"
    );

    expect(source).toContain('document.title = "Budgets | Penni"');
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
