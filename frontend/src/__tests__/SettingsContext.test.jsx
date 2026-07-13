import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { SettingsProvider, useSettings } from "../contexts/SettingsContext";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

const mockSetTheme = jest.fn();

jest.mock("next-themes", () => ({ useTheme: () => ({ setTheme: mockSetTheme }) }));
jest.mock("../lib/api", () => ({ api: { get: jest.fn(), put: jest.fn() } }));
jest.mock("../contexts/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));

function SettingsProbe() {
  const { settings, loaded } = useSettings();
  return <div>{loaded ? `${settings.currency}:loaded` : "loading"}</div>;
}

describe("SettingsProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test("does not call the protected settings endpoint for signed-out visitors", async () => {
    localStorage.setItem("financeai_settings", JSON.stringify({ currency: "USD" }));
    useAuth.mockReturnValue({ user: false, loading: false });

    render(<SettingsProvider><SettingsProbe /></SettingsProvider>);

    await waitFor(() => expect(screen.getByText("GBP:loaded")).toBeInTheDocument());
    expect(api.get).not.toHaveBeenCalled();
  });

  test("loads authenticated settings and stores them under the user id", async () => {
    useAuth.mockReturnValue({ user: { user_id: "user-1" }, loading: false });
    api.get.mockResolvedValue({
      data: { currency: "EUR", theme: "light", preferences: {} },
    });

    render(<SettingsProvider><SettingsProbe /></SettingsProvider>);

    await waitFor(() => expect(screen.getByText("EUR:loaded")).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith("/settings/app");
    expect(JSON.parse(localStorage.getItem("financeai_settings:user-1"))).toMatchObject({ currency: "EUR" });
  });
});
