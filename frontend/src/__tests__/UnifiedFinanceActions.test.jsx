import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActionProvider, useActions } from "../contexts/ActionContext";
import GlobalActionHost from "../components/actions/GlobalActionHost";
import { api } from "../lib/api";

jest.mock("../contexts/CategoriesContext", () => ({
  useCategories: () => ({
    categories: [{ name: "groceries", label: "Groceries", color: "#5b5cf0" }],
    version: 1,
    resolveCategory: name => ({ name, label: name || "Groceries" }),
    createCategory: jest.fn(),
  }),
}));
jest.mock("../lib/api", () => ({
  api: {
    get: jest.fn(() => Promise.resolve({ data: { accounts: [] } })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
  },
  formatApiError: () => "Could not complete request",
}));
jest.mock("../components/CategoryCombobox", () => {
  const ReactMock = require("react");
  return {
    __esModule: true,
    default: ({ value, onChange, categories = [] }) =>
      ReactMock.createElement("select", {
        "aria-label": "Category",
        value,
        onChange: event => onChange(event.target.value),
      }, [
        ReactMock.createElement("option", { key: "empty", value: "" }, "Choose a category"),
        ...categories.map(category =>
          ReactMock.createElement("option", { key: category.name, value: category.name }, category.label)),
      ]),
  };
});

const existing = { budget_id: "b1", category: "groceries", limit: 100, budget_type: "everyday" };
function Launcher() {
  const { openAction } = useActions();
  return <>
    <button type="button" onClick={() => openAction("budget-edit", { budget: existing })}>Open budget editor</button>
    <button type="button" onClick={() => openAction("budget-new", { month: "2026-11" })}>Open new budget</button>
  </>;
}
beforeEach(() => {
  api.post.mockClear();
  api.patch.mockClear();
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });
});

test("editing a budget opens the same native dialog on all pages and saves changes", async () => {
  render(<ActionProvider><Launcher /><GlobalActionHost /></ActionProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Open budget editor" }));
  expect(screen.getByRole("dialog", { name: "Edit budget" })).toBeVisible();
  fireEvent.change(screen.getByLabelText(/Budget limit/i), { target: { value: "175" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/budgets/b1", expect.objectContaining({
    category: "groceries", limit: 175,
  })));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit budget" })).not.toBeInTheDocument());
});

test("new budget validates inline without closing the popup and saves to chosen month", async () => {
  render(<ActionProvider><Launcher /><GlobalActionHost /></ActionProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Open new budget" }));
  expect(screen.getByRole("dialog", { name: "Create budget" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Create budget" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose a category");
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "groceries" } });
  fireEvent.change(screen.getByLabelText(/Budget limit/i), { target: { value: "180" } });
  fireEvent.click(screen.getByRole("button", { name: "Create budget" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/budgets", expect.objectContaining({
    category: "groceries", limit: 180, month: "2026-11",
  })));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create budget" })).not.toBeInTheDocument());
});

test("there is only one transaction entry workflow across the two pages", () => {
  const fs = require("fs");
  const path = require("path");
  const tx = fs.readFileSync(path.join(__dirname, "..", "pages", "Transactions.jsx"), "utf8");
  const budgets = fs.readFileSync(path.join(__dirname, "..", "pages", "BudgetPage.jsx"), "utf8");
  expect(tx).toContain('openAction("transaction-new"');
  expect(tx).toContain('openAction("transaction-edit"');
  expect(tx).not.toContain("<TransactionForm");
  expect(budgets).toContain('openAction("transaction-edit"');
  expect(budgets).toContain('openAction("budget-edit"');
  expect(budgets).not.toContain("<TransactionForm");
  expect(budgets).not.toContain("<Sheet open={Boolean(editingId)}");
});
