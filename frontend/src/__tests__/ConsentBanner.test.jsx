import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import ConsentBanner from "../components/ConsentBanner";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

jest.mock("../lib/api", () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

jest.mock("../contexts/AuthContext", () => ({
  useAuth: jest.fn(),
}));

describe("ConsentBanner", () => {
  beforeEach(() => jest.clearAllMocks());

  test("does not request protected consent data for a signed-out visitor", () => {
    useAuth.mockReturnValue({ user: false, loading: false });
    render(<ConsentBanner />);

    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: /privacy choices/i })).not.toBeInTheDocument();
  });

  test("shows accurate privacy choices when an authenticated user has not chosen", async () => {
    useAuth.mockReturnValue({ user: { user_id: "user-1" }, loading: false });
    api.get.mockResolvedValue({ data: { current: { privacy: null } } });

    render(<ConsentBanner />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/gdpr/consent"));
    expect(screen.getByRole("region", { name: /privacy choices/i })).toBeInTheDocument();
    expect(screen.getByText(/trusted service providers/i)).toBeInTheDocument();
    expect(screen.queryByText(/never share it with third parties/i)).not.toBeInTheDocument();
  });
});
