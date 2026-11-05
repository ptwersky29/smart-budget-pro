import React from "react";
import { render, screen } from "@testing-library/react";
import {
  getTransactionType,
  getTransactionStatus,
  groupTransactionsByDate,
  formatTransactionDay,
  TransactionDateHeading,
} from "../components/GroupedTransactionItems";

describe("unified transaction presentation", () => {
  test("classifies income, expenses, and paired transfers distinctly", () => {
    expect(getTransactionType({ amount: 123 })).toBe("income");
    expect(getTransactionType({ amount: -5 })).toBe("expense");
    expect(getTransactionType({ amount: -100, is_transfer: true })).toBe("transfer");
    expect(getTransactionType({ amount: 100, transfer_pair_id: "transfer-1" })).toBe("transfer");
    expect(getTransactionType({ amount: -100, category: "Internal Transfer" })).toBe("transfer");
  });

  test("keeps day sections in supplied sort order with accurate focus offsets", () => {
    const transactions = [
      { transaction_id: "t1", date: "2026-11-05" },
      { transaction_id: "t2", date: "2026-11-05" },
      { transaction_id: "t3", date: "2026-11-04" },
      { transaction_id: "t4", date: "2026-11-03" },
      { transaction_id: "t5", date: "2026-11-03" },
    ];
    const groups = groupTransactionsByDate(transactions);
    expect(groups.map(group => [group.date, group.startIndex, group.items.length])).toEqual([
      ["2026-11-05", 0, 2],
      ["2026-11-04", 2, 1],
      ["2026-11-03", 3, 2],
    ]);
  });

  test("shows the same approval status wherever a transaction appears", () => {
    expect(getTransactionStatus({} ).label).toBe("Approved");
    expect(getTransactionStatus({ pending: true }).label).toBe("Pending");
    expect(getTransactionStatus({ approval_status: "unapproved" }).label).toBe("Unapproved");
    expect(getTransactionStatus({ approval_status: "failed" }).label).toBe("Failed");
  });

  test("renders accessible sticky day headings with counts", () => {
    render(<TransactionDateHeading date="2026-11-05" count={3} />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveClass("sticky");
    expect(heading).toHaveAttribute("data-transaction-date", "2026-11-05");
    expect(heading).toHaveTextContent("3 transactions");
    expect(formatTransactionDay("bad-date")).toBe("Unknown date");
  });

  test("allows a non-sticky heading when the enclosing table cell owns stickiness", () => {
    render(<TransactionDateHeading date="2026-11-04" count={1} sticky={false} />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).not.toHaveClass("sticky");
    expect(heading).toHaveTextContent("1 transaction");
  });
});
