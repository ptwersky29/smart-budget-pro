import React from "react";
import { render, screen } from "@testing-library/react";
import { TrendingUp } from "lucide-react";
import { WorkspaceMetric } from "../components/ui/workspace";
import { TransactionTypeMark, TransactionDateHeading } from "../components/GroupedTransactionItems";

describe("compact transaction workspace", () => {
  it("keeps the summary values and notes accessible in dense mode", () => {
    const { container } = render(
      <WorkspaceMetric dense label="Income" value="£1,500.00" note="Approved transactions" icon={TrendingUp} />,
    );
    expect(screen.getByText("Income")).toBeInTheDocument();
    expect(screen.getByText("£1,500.00")).toBeInTheDocument();
    expect(screen.getByText("Approved transactions")).toBeInTheDocument();
    expect(container.querySelector(".workspace-metric-dense")).toBeInTheDocument();
  });

  it("keeps normal metrics unchanged unless dense is requested", () => {
    const { container } = render(<WorkspaceMetric label="Income" value="£10.00" />);
    expect(container.querySelector(".workspace-metric-dense")).not.toBeInTheDocument();
  });

  it("offers compact transaction type icons and readable labels", () => {
    const { container } = render(
      <>
        <TransactionTypeMark transaction={{ amount: -50 }} compact />
        <TransactionTypeMark transaction={{ amount: -50 }} badge compact />
      </>,
    );
    expect(screen.getByLabelText("Expense")).toBeInTheDocument();
    expect(screen.getByText("Expense")).toBeInTheDocument();
    expect(screen.getByLabelText("Expense")).toHaveClass("h-[30px]");
  });

  it("keeps a day heading sticky while saving vertical space", () => {
    const { container } = render(<TransactionDateHeading date="2026-11-05" count={2} />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveClass("sticky");
    expect(heading).toHaveClass("min-h-[34px]");
    expect(container).toHaveTextContent("2 transactions");
  });
});
