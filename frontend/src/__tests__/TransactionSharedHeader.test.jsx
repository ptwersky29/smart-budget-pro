import fs from "fs";
import path from "path";

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

describe("Transactions shares the standard Penni top header", () => {
  const appLayout = read("pages/AppLayout.jsx");
  const css = read("design-system/transactions-reference.css");
  const transactions = read("pages/Transactions.jsx");

  test("the global header stays rendered on Transactions and keeps the global controls", () => {
    expect(appLayout).toContain('data-tour="route-header"');
    expect(appLayout).toContain("routeMeta.title");
    expect(appLayout).toContain('location.pathname === "/transactions"');
    expect(appLayout).toContain('data-testid="command-open"');
    expect(appLayout).toContain("<NotificationCenter />");
    expect(css).not.toMatch(/\.penni-route-header\s*\{\s*display\s*:\s*none/);
  });

  test("does not force a duplicate title inside the desktop Transactions workspace", () => {
    expect(css).not.toMatch(/\.transactions-primary\s+\.penni-inner-title\s*\{\s*display\s*:\s*block\s*!important/);
    expect(css).toContain("AppLayout owns the single global page title");
    expect(css).toContain("workspace-page-header > :first-child");
    expect(css).toContain("display:none;");
  });

  test("keeps the in-page month picker and action buttons accessible", () => {
    expect(transactions).toContain("penni-reference-month-switcher");
    expect(transactions).toContain('data-testid="add-transaction"');
    expect(transactions).toContain('aria-label="Transaction options"');
    expect(css).toContain("margin-left:auto;");
  });
});
