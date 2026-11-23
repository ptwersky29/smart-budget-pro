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
      if (url === "/truelayer/connections") return Promise.resolve({ data¶»§q«^