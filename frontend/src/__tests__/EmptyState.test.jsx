import React from "react";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../components/ui/layout";
import { Wallet } from "lucide-react";

test("renders title and description", () => {
  render(<EmptyState title="No data" description="Add some data to get started." />);
  expect(screen.getByText("No data")).toBeInTheDocument();
  expect(screen.getByText("Add some data to get started.")).toBeInTheDocument();
});

test("renders icon when provided", () => {
  render(<EmptyState icon={Wallet} title="Empty" description="No items yet." />);
  const icon = document.querySelector(".lucide-wallet");
  expect(icon).toBeInTheDocument();
});

test("renders action slot", () => {
  render(<EmptyState title="Test" description="Test" action={<button>Add</button>} />);
  expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
});
