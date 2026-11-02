import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ActionProvider, useActions } from "../contexts/ActionContext";

function TestActions() {
  const { active, openAction, closeAction } = useActions();
  return <div>
    <button onClick={() => openAction("transaction-new", { accountId:"acc-123" })}>Open transaction</button>
    <button onClick={() => openAction("budget-new")}>Open budget</button>
    <button onClick={closeAction}>Close</button>
    <output>{active ? `${active.type}:${active.payload.accountId||""}` : "idle"}</output>
  </div>;
}

test("switches global actions in place and preserves action parameters", () => {
  render(<ActionProvider><TestActions/></ActionProvider>);
  expect(screen.getByText("idle")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Open transaction"));
  expect(screen.getByText("transaction-new:acc-123")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Open budget"));
  expect(screen.getByText("budget-new:")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Close"));
  expect(screen.getByText("idle")).toBeInTheDocument();
});

test("notifies the active page after saving", () => {
  let events = 0;
  const listener = e => { if (e.detail.entity === "budgets") events++; };
  window.addEventListener("penni:data-changed", listener);
  function Notify() {
    const { changed } = useActions();
    return <button onClick={() => changed("budgets")}>Saved budget</button>;
  }
  try {
    render(<ActionProvider><Notify/></ActionProvider>);
    fireEvent.click(screen.getByText("Saved budget"));
    expect(events).toBe(1);
  } finally {
    window.removeEventListener("penni:data-changed",listener);
  }
});
