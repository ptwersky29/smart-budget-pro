import React from "react";
import { render, screen } from "@testing-library/react";
import TransactionSummaryCards, { buildTransactionSparklines } from "../components/TransactionSummaryCards";
import { TransactionDateHeading } from "../components/GroupedTransactionItems";
import fs from "fs";
import path from "path";

describe("Penni reference transaction workspace", () => {
  it("shows four real-data summary cards instead of fabricated screenshot figures", () => {
    const transactions = [
      { date:"2026-11-05", amount: 150, category:"Income" },
      { date:"2026-11-04", amount: -35, category:"Transport" },
      { date:"2026-11-04", amount: -500, is_transfer:true },
      { date:"2026-11-04", amount: 500, is_transfer:true }
    ];
    render(<TransactionSummaryCards
      income={150} expenses={35} transfers={500} transferCount={1} net={115}
      month="2026-11" monthLabel="November 2026" trendRows={transactions} />);
    expect(screen.getByText("Income")).toBeInTheDocument();
    expect(screen.getByText("Expenses")).toBeInTheDocument();
    expect(screen.getByText("Transfers")).toBeInTheDocument();
    expect(screen.getByText("Net")).toBeInTheDocument();
    expect(screen.getByText("1 transfer this month")).toBeInTheDocument();
    expect(screen.getByText("£150.00")).toBeInTheDocument();
    expect(screen.getByText("£500.00")).toBeInTheDocument();
    expect(document.querySelectorAll(".penni-reference-kpi")).toHaveLength(4);
  });

  it("excludes paired transfers from income/expense trends and counts each debit once", () => {
    const trends = buildTransactionSparklines([
      { date:"2026-11-05", amount: 100 },
      { date:"2026-11-05", amount: -20 },
      { date:"2026-11-05", amount: -200, transfer_pair_id:"abc" },
      { date:"2026-11-05", amount: 200, transfer_pair_id:"abc" },
      { date:"2026-10-05", amount: 999 },
    ], "2026-11");
    expect(trends[1]).toEqual({income:100,expense:20,transfer:200,net:80});
    expect(trends[0].income).toBe(0);
  });

  it("preserves sticky date groups and shows visible-day net totals", () => {
    render(<TransactionDateHeading date="2026-11-05" count={3} net={-57} />);
    const heading = screen.getByRole("heading", { level:3 });
    expect(heading).toHaveClass("sticky");
    expect(heading).toHaveTextContent("3 transactions");
    expect(heading).toHaveTextContent("Net -£57.00");
  });

  it("keeps the reference toolbar, type column, real editor and filter sheet", () => {
    const source = fs.readFileSync(path.join(__dirname,"../pages/Transactions.jsx"),"utf8");
    expect(source).toContain("penni-reference-toolbar");
    expect(source).toContain("penni-reference-tabs-bar");
    expect(source).toContain("showTypeColumn");
    expect(source).toContain("TransactionSummaryCards");
    expect(source).toContain('openAction("transaction-new"');
    expect(source).toContain("<SheetContent");
  });
});
