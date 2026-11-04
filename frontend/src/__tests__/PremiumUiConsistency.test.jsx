import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import SettingsLayout from "../components/SettingsLayout";
import { StatCard } from "../components/ui/page";
import { formatCurrency } from "../lib/format";

const source = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

describe("premium Penni layout and accessibility contracts", () => {
  test("Settings sections are discoverable and the active section is announced", () => {
    const selectSection = jest.fn();
    render(
      <SettingsLayout active="appearance" onChange={selectSection}>
        <div>Settings content</div>
      </SettingsLayout>
    );
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appearance" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    expect(selectSection).toHaveBeenCalledWith("categories");
    expect(screen.getByText("Settings content")).toBeInTheDocument();
  });

  test("large amounts are kept together in the shared metric cards", () => {
    const amount = formatCurrency(1234567.89);
    render(<StatCard label="Total balance" value={amount} detail="All accounts" />);
    const value = screen.getByText(amount);
    expect(value).toHaveAttribute("title", amount);
    expect(value).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("All accounts")).toBeInTheDocument();
  });

  test("brand and success colour tokens are distinct", () => {
    const css = source("index.css");
    expect(css).toContain("--primary: 240 84% 65%");
    expect(css).toContain("--emerald: 160 72% 35%");
    expect(css).toContain("--fs-base: 1rem");
  });

  test("dashboard and account history use one vertical scroll owner", () => {
    const css = source("design-system/penni-reference.css");
    expect(css).toContain(".penni-v2 .dashboard-reference > .dashboard-panels > div");
    expect(css).toContain(".penni-v2 .accounts-workspace .penni-account-history-list");
    expect(css).toContain("max-height:none;\n  overflow:visible;");
  });

  test("dropdowns receive focus and have collision-aware positioning", () => {
    const select = source("components/PenniSelect.jsx");
    expect(select).toContain("onOpenAutoFocus");
    expect(select).toContain("listboxRef");
    expect(select).toContain("collisionPadding={12}");
    const category = source("components/CategoryCombobox.jsx");
    expect(category).toContain('<CommandInput aria-label="Search categories"');
  });

  test("analytics shows an honest over-budget percentage", () => {
    const analytics = source("pages/Analytics.jsx");
    expect(analytics).toContain("Math.round(actualPct)");
    expect(analytics).toContain('actualPct > 100 ? " · Over budget" : ""');
  });

  test("specialist forms carry field labels and admin tables remain scrollable", () => {
    expect(source("pages/UKTools.jsx")).toContain("htmlFor={testid}");
    const admin = source("pages/AdminDashboard.jsx");
    expect(admin).toContain('aria-label="Filter users by role"');
    expect(admin).toContain('aria-label="Security login history"');
  });
});
