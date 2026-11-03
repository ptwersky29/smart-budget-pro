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

  test("account form modal exposes dialog semantics", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "components", "AccountFormModal.jsx"),
      "utf8"
    );

    // Radix supplies role="dialog", aria-modal and title association via
    // Dialog.Content / Dialog.Title, avoiding fragile hand-written overlays.
    expect(source).toContain("<NativePopup");
    const native = fs.readFileSync(
      path.join(__dirname, "..", "components", "ui", "NativePopup.jsx"),
      "utf8"
    );
    expect(native).toContain("<Dialog.Root");
    expect(native).toContain("<Dialog.Content");
    expect(native).toContain("<Dialog.Title");
  });
});
