import fs from "fs";
import path from "path";

const source = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

describe("Penni shared shell consistency on the Transactions route", () => {
  const shell = source("pages/AppLayout.jsx");
  const styles = source("design-system/transactions-reference.css");

  test("uses the same navigation sections and action button as Accounts", () => {
    expect(shell).toContain("const visibleNavigation = NAV_SECTIONS.filter(");
    expect(shell).not.toContain("transactionMainNavigation");
    expect(shell).not.toContain("penni-sidebar-create");
    expect(shell).toContain('sidebarCompact ? "w-[84px]" : "w-[264px]"');
  });

  test("does not override sidebar width, nav identity or profile appearance", () => {
    expect(styles).not.toMatch(/\.penni-reference-transactions-shell\s+\.penni-sidebar\b/);
    expect(styles).not.toContain("232px");
    expect(styles).not.toContain("sidebar-profile");
  });

  test("honours the shared workspace width and font scale", () => {
    expect(styles).toContain("max-width:var(--content-max)");
    expect(styles).toContain("font-family:var(--font-body");
    expect(styles).toContain("font-size:26px; line-height:1.25");
    expect(styles).toContain("font-size:13px;font-weight:600;color:hsl(var(--foreground))");
  });

  test("keeps transaction reference design and sticky day groups", () => {
    expect(styles).toContain("penni-reference-kpis");
    expect(styles).toContain("penni-reference-toolbar");
    expect(styles).toContain("penni-reference-tabs-bar");
    expect(styles).toContain(".penni-tx-date-heading");
    expect(styles).toContain("position:sticky;top:43px");
  });
});
