import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Trading212Activity from "../components/Trading212Activity";
import { api } from "../lib/api";

jest.mock("../lib/api", () => ({
  api: { get: jest.fn() },
  formatApiError: error => typeof error === "string" ? error : "Could not load history",
}));

beforeEach(() => { jest.clearAllMocks(); });

test("Trading 212 activity shows actual cash movements, not a simulated balance", async () => {
  api.get.mockResolvedValue({ data: {
    items: [{
      id:"cash-one", description:"Deposit", type:"DEPOSIT",
      amount:500, currency:"GBP", date:"2026-11-19T09:30:00Z",
    }],
    next_page:null,
  } });
  render(<Trading212Activity />);
  expect(await screen.findByText("Deposit")).toBeInTheDocument();
  expect(screen.getByText("£500.00")).toBeInTheDocument();
  expect(screen.getByText(/not an exact historical portfolio-value chart/i)).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/trading212/activity", {params:{kind:"transactions"}});
});

test("History selector switches to read-only orders", async () => {
  api.get
    .mockResolvedValueOnce({data:{items:[],next_page:null}})
    .mockResolvedValueOnce({data:{items:[{
      id:"order-1",description:"ETF",type:"BUY",
      date:"2026-11-18T12:00:00Z",amount:null,currency:"GBP",
    }],next_page:null}});
  render(<Trading212Activity />);
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", {name:"Trades"}));
  expect(await screen.findByText("ETF")).toBeInTheDocument();
  expect(api.get).toHaveBeenLastCalledWith("/trading212/activity",{params:{kind:"orders"}});
});

test("No history permission is explained rather than shown as empty balance", async () => {
  api.get.mockRejectedValue({response:{data:{detail:"Trading 212 API key needs History permission"}}});
  render(<Trading212Activity />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Trading 212 API key needs History permission");
});
