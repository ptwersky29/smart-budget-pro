import React from "react";
import { render, screen } from "@testing-library/react";
import TransactionWorkspaceSummary from "../components/TransactionWorkspaceSummary";

test("shows real supplied totals in one compact bar", () => {
  render(<TransactionWorkspaceSummary income={2500} expenses={700} net={1800}
    reviewCount={12} periodLabel="November 2026" />);
  expect(screen.getByRole("region", {name:"Transaction totals for November 2026"})).toBeInTheDocument();
  expect(screen.getByText("Income")).toBeInTheDocument();
  expect(screen.getByText("Expenses")).toBeInTheDocument();
  expect(screen.getByText("Net movement")).toBeInTheDocument();
  expect(screen.getByText("12")).toBeInTheDocument();
});
