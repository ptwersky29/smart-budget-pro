import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActionProvider, useActions } from "../contexts/ActionContext";
import GlobalActionHost from "../components/actions/GlobalActionHost";
import { api } from "../lib/api";

jest.mock("../contexts/CategoriesContext", () => ({
  useCategories: () => ({
    categories: [{ name: "groceries", label: "Groceries", color: "#5b5cf0" }],
    version: 1,
    sectionOptions: ["Everyday", "Other"],
    resolveCategory: name => ({ name, label: String(name).replace(/_/g," "), color:"#5b5cf0" }),
    createCategory: jest.fn(),
  }),
}));
jest.mock("../lib/api", () => ({
  api: {
    get: jest.fn(() => Promise.resolve({ data: { accounts: [
      { account_id: "a1", name: "Current", balance: 100, currency: "GBP" },
    ] } })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
  formatApiError: () => "Request failed",
}));

function NewTransactionLauncher() {
  const { openAction } = useActions();
  return <button type="button" onClick={() => openAction("transaction-new")}>New transaction</button>;
}

test("global New transaction button opens a visible, accessible native form", async () => {
  // react-scripts resets jest.fn implementations before each test.
  api.get.mockImplementation(() => Promise.resolve({ data: { accounts: [
    { account_id: "a1", name: "Current", balance: 100, currency: "GBP" },
  ] } }));
  render(<ActionProvider><NewTransactionLauncher/><GlobalActionHost/></ActionProvider>);
  fireEvent.click(screen.getByRole("button",{name:"New transaction"}));
  const dialog = await screen.findByRole("dialog",{name:"New transaction"});
  expect(dialog).toBeVisible();
  expect(screen.getByTestId("tx-amount")).toBeVisible();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/accounts"));
  fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
  await waitFor(() => expect(screen.queryByRole("dialog",{name:"New transaction"})).not.toBeInTheDocument());
});
