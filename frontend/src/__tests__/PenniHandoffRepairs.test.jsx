import React from "react";
import { render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { WorkspaceMetric } from "../components/ui/workspace";
import { formatCurrency, formatDateTime } from "../lib/format";
import { humanizeCategoryName } from "../lib/categories";

const sourceOf = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

describe("Penni audit: financial presentation", () => {
  test("compact metrics retain an accessible complete monetary value", () => {
    const complete = formatCurrency(125000.55);
    render(<WorkspaceMetric label="Income" value={complete} compactValue={formatCurrency(125000.55, { compact: true })} />);
    expect(screen.getByTitle(complete)).toBeInTheDocument();
    expect(screen.getByTitle(complete)).toHaveClass("whitespace-nowrap");
    expect(screen.getByText(complete)).toHaveClass("sr-only");
  });

  test("UK time and human category labels are predictable", () => {
    expect(humanizeCategoryName("public_transport")).toBe("Public Transport");
    expect(humanizeCategoryName("maaser_tzedakah")).toBe("Maaser Tzedakah");
    expect(formatCurrency(125000.5)).toContain("125,000.50");
    expect(formatDateTime("2026-11-04T14:00:00Z")).toMatch(/Nov 2026/);
  });
});

describe("Penni audit: core source contracts", () => {
  test("the ledger dates are scoped from the very first request", () => {
    const tx = sourceOf("pages/Transactions.jsx");
    expect(tx).toContain('if (!searchParams.has("date_from") && !searchParams.has("date_to"))');
    expect(tx).toContain('if (requestId !== ledgerRequestId.current) return;');
    expect(tx).toContain('groupTransactionsByDate');
    expect(tx).toContain('<TransactionDateHeading');
    expect(tx).toContain('aria-label="Filter from date"');
    expect(tx).toContain('aria-label="Filter to date"');
  });

  test("the mobile layout has a compact financial strip and discoverable budget entry", () => {
    expect(sourceOf("components/ui/workspace.jsx")).toContain('columns === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3"');
    expect(sourceOf("pages/MorePage.jsx")).toContain('to="/budgets"');
    expect(sourceOf("components/CategoryCombobox.jsx")).toContain('collisionPadding={12}');
  });

  test("investments explain compounding and expose years, units and chart legend", () => {
    const s = sourceOf("pages/Investments.jsx");
    expect(s).toContain('htmlFor="invest-monthly"');
    expect(s).toContain('min="1" max="50"');
    expect(s).toContain("month-end");
    expect(s).toContain("<Legend");
    expect(s).toContain("yearly projection data");
    expect(s).toContain('label={result.gain < 0 ? "Net loss" : "Net gain"}');
  });

  test("secondary pages do not show false empty counts while loading", () => {
    expect(sourceOf("pages/Subscriptions.jsx")).toContain('loading || loadError ? "—" : formatCurrency(monthlyTotal)');
    expect(sourceOf("pages/Statements.jsx")).toContain('historyLoading ? (');
  });

  test("SMS and commands announce their interactive fields", () => {
    const sms = sourceOf("pages/SMS.jsx");
    expect(sms).toContain('htmlFor="sms-phone-number"');
    expect(sms).toContain('htmlFor="sms-message-text"');
    expect(sms).toContain('open={pendingSenderRemoval != null}');
    expect(sourceOf("components/CommandPalette.jsx")).toContain('aria-label="Search Penni"');
  });

  test("notifications Escape closes the panel and returns focus", () => {
    const src = sourceOf("components/NotificationCenter.jsx");
    expect(src).toContain('if (event.key === "Escape")');
    expect(src).toContain('triggerRef.current?.focus()');
    expect(src).toContain('aria-expanded={open}');
  });
});
