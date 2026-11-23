import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotificationCenter from "../components/NotificationCenter";
import Connections from "../pages/Connections";
import { api } from "../lib/api";

jest.mock("../lib/api", () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  formatApiError: jest.fn(() => "error"),
}));

jest.mock("../components/BankCardMockup", () => () => <div>Bank card</div>);
jest.mock("../components/AddManualAccountModal", () => () => null);

const connectionPayload = {
  connections: [], recent_syncs: [], total_transactions: 0,
};
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const visible = (state) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  fireEvent(document, new Event("visibilitychange"));
};

describe("event-driven data refresh (no idle database polling)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    api.get.mockImplementation((url) => {
      if (url === "/notifications") return Promise.resolve({ data: [{ id: "n1", read: false, title: "Update", message: "Ready", type: "info" }] });
      if (url === "/truelayer/connections") return Promise.resolve({ data: connectionPayload });
      if (url === "/accounts/manual") return Promise.resolve({ data: { accounts: [] } });
      return Promise.reject(new Error("Unexpected GET " + url));
    });
    api.put.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: { new_transactions: 0, duplicates_skipped: 0 } });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("notifications fetch once, never poll while idle, and refresh on open and visible return", async () => {
    const view = render(<NotificationCenter />);
    await flush();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /1 unread/i })).toBeInTheDocument();

    await act(async () => { jest.advanceTimersByTime(180000); });
    expect(api.get).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("notifications-bell"));
    await flush();
    expect(api.get).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText("Update"));
    await flush();
    expect(api.put).toHaveBeenCalledWith("/notifications/n1", { read: true });
    expect(api.get).toHaveBeenCalledTimes(3);

    visible("hidden");
    await flush();
    expect(api.get).toHaveBeenCalledTimes(3);
    visible("visible");
    await flush();
    expect(api.get).toHaveBeenCalledTimes(4);
    view.unmount();
    visible("visible");
    expect(api.get).toHaveBeenCalledTimes(4);
  });

  test("connections initial load happens once per endpoint, remains idle and refreshes when visible", async () => {
    const view = render(<MemoryRouter><Connections /></MemoryRouter>);
    await flush();
    expect(api.get.mock.calls.filter(([url]) => url === "/truelayer/connections")).toHaveLength(1);
    expect(api.get.mock.calls.filter(([url]) => url === "/accounts/manual")).toHaveLength(1);
    await act(async () => { jest.advanceTimersByTime(180000); });
    expect(api.get).toHaveBeenCalledTimes(2);
    visible("hidden");
    await flush();
    expect(api.get).toHaveBeenCalledTimes(2);
    visible("visible");
    await flush();
    expect(api.get).toHaveBeenCalledTimes(4);
    view.unmount();
    visible("visible");
    expect(api.get).toHaveBeenCalledTimes(4);
    expect(api.post).not.toHaveBeenCalled();
  });

  test("manual Sync now refreshes connections without background auto-sync", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/truelayer/connections") return Promise.resolve({ data: {
        ...connectionPayload,
        connections: [{ connection_id: "bank-1", provider: "truelayer", status: "active", account_name: "Test bank", balance: 0 }],
      } });
      if (url === "/accounts/manual") return Promise.resolve({ data: { accounts: [] } });
      return Promise.reject(new Error("Unexpected GET " + url));
    });
    render(<MemoryRouter><Connections /></MemoryRouter>);
    await flush();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("sync-now"));
    await flush();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/truelayer/sync");
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(4));
    await act(async () => { jest.advanceTimersByTime(60000); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledTimes(4);
  });

  test("unmount aborts pending connection request", async () => {
    let signal;
    api.get.mockImplementation((url, opts) => {
      if (url === "/truelayer/connections") {
        signal = opts.signal;
        return new Promise(() => {});
      }
      return Promise.resolve({ data: { accounts: [] } });
    });
    const view = render(<MemoryRouter><Connections /></MemoryRouter>);
    expect(signal).toBeDefined();
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
