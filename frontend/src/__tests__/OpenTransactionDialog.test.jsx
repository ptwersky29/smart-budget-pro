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
    patch: jest.fn(),
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

test("Add transaction submits a signed amount to the real transactions API route", async () => {
  api.get.mockResolvedValue({ data: { accounts: [
    { account_id: "a1", name: "Current", balance: 100, currency: "GBP" },
  ] } });
  api.post.mockResolvedValue({ data: { transaction_id: "tx_new" } });
  render(<ActionProvider><NewTransactionLauncher/><GlobalActionHost/></ActionProvider>);
  fireEvent.click(screen.getByRole("button", {name:"New transaction"}));
  await screen.findByRole("dialog", {name:"New transaction"});
  await waitFor(() => expect(screen.getByRole("combobox", {name: "Choose option"})).toHaveTextContent("Current"));
  fireEvent.change(screen.getByTestId("tx-amount"), {target:{value:"23.40"}});
  fireEvent.change(screen.getByTestId("tx-desc"), {target:{value:"Groceries"}});
  fireEvent.click(screen.getByTestId("tx-submit"));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/transactions", expect.objectContaining({
    account_id: "a1", amount: -23.4, description: "Groceries", is_income:false,
  })));
  await waitFor(() => expect(screen.queryByRole("dialog", {name:"New transaction"})).not.toBeInTheDocument());
});

test("Add transaction shows actionable errors instead of silently doing nothing", async () => {
  api.get.mockResolvedValue({data:{accounts: [
    {account_id:"a1",name:"Current",balance:100,currency:"GBP"},
  ]}});
  render(<ActionProvider><NewTransactionLauncher/><GlobalActionHost/></ActionProvider>);
  fireEvent.click(screen.getByRole("button",{name:"New transaction"}));
  await screen.findByRole("dialog",{name:"New transaction"});
  // The single account is selected asynchronously after the dialog opens.
  await waitFor(() => expect(screen.getByRole("combobox", {name: "Choose option"})).toHaveTextContent("Current"));
  fireEvent.click(screen.getByTestId("tx-submit"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter an amount greater than zero.");
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId("tx-amount"),{target:{value:"12.99"}});
  fireEvent.click(screen.getByTestId("tx-submit"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a transaction description.");
  expect(api.post).not.toHaveBeenCalled();
});

test("Failed background saves close the form immediately and reverse the temporary row", async () => {
  api.get.mockResolvedValue({data:{accounts: [
    {account_id:"a1",name:"Current",balance:100,currency:"GBP"},
  ]}});
  api.post.mockRejectedValueOnce({response:{data:{detail:"Account is unavailable"}}});
  const changes = [];
  const listener = event => changes.push(event.detail);
  window.addEventListener("penni:data-changed", listener);
  try {
    render(<ActionProvider><NewTransactionLauncher/><GlobalActionHost/></ActionProvider>);
    fireEvent.click(screen.getByRole("button",{name:"New transaction"}));
    await screen.findByRole("dialog",{name:"New transaction"});
    await waitFor(() => expect(screen.getByRole("combobox", {name:"Choose option"})).toHaveTextContent("Current"));
    fireEvent.change(screen.getByTestId("tx-amount"),{target:{value:"17.00"}});
    fireEvent.change(screen.getByTestId("tx-desc"),{target:{value:"Groceries"}});
    fireEvent.click(screen.getByTestId("tx-submit"));
    // The user can immediately work on another transaction, even when the
    // server returns an error several seconds later.
    expect(screen.queryByRole("dialog",{name:"New transaction"})).not.toBeInTheDocument();
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({operation:"created",phase:"optimistic"}),
    ]));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({operation:"created-rolled-back",phase:"rolled-back"}),
    ])));
  } finally {
    window.removeEventListener("penni:data-changed",listener);
  }
});


function EditTransactionLauncher() {
  const { openAction } = useActions();
  const transaction = {
    transaction_id:"tx-edit-unapproved", account_id:"a1", amount:-19.75,
    date:"2026-11-18", description:"Shop purchase", category:"grocery",
    approval_status:"unapproved", category_approval_status:"unapproved",
    source:"truelayer",
  };
  return <button type="button" onClick={() => openAction("transaction-edit", {transaction})}>Edit transaction</button>;
}

test("manually editing an unapproved transaction approves it instantly and on the server", async () => {
  api.get.mockResolvedValue({data:{accounts:[
    {account_id:"a1",name:"Current",balance:100,currency:"GBP"},
  ]}});
  api.patch.mockResolvedValue({data:{
    transaction_id:"tx-edit-unapproved", account_id:"a1", amount:-19.75,
    date:"2026-11-18", description:"Shop purchase corrected",
    category:"grocery", approval_status:"approved", category_approval_status:"approved",
  }});
  const changes = [];
  const listener = event => changes.push(event.detail);
  window.addEventListener("penni:data-changed", listener);
  try {
    render(<ActionProvider><EditTransactionLauncher/><GlobalActionHost/></ActionProvider>);
    fireEvent.click(screen.getByRole("button",{name:"Edit transaction"}));
    await screen.findByRole("dialog",{name:"Edit transaction"});
    await waitFor(() => expect(screen.getByRole("combobox",{name:"Choose option"})).toHaveTextContent("Current"));
    fireEvent.change(screen.getByTestId("tx-desc"),{target:{value:"Shop purchase corrected"}});
    fireEvent.click(screen.getByTestId("tx-submit"));
    // Manual approval should be reflected in the optimistic row even before
    // the API answers, but must still roll back if saving fails.
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase:"optimistic",
        record:expect.objectContaining({
          transaction_id:"tx-edit-unapproved",
          approval_status:"approved",
          category_approval_status:"approved",
          _saveStatus:"saving",
        }),
      }),
    ]));
    expect(screen.queryByRole("dialog",{name:"Edit transaction"})).not.toBeInTheDocument();
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/transactions/tx-edit-unapproved",
      expect.objectContaining({
        approval_status:"approved",category_approval_status:"approved",
        description:"Shop purchase corrected",
      }),
    ));
    await waitFor(() => expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase:"confirmed",
        record:expect.objectContaining({approval_status:"approved",category_approval_status:"approved"}),
      }),
    ])));
  } finally {
    window.removeEventListener("penni:data-changed", listener);
  }
});
