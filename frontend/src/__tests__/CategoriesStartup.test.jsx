import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { CategoriesProvider, useCategories } from "../contexts/CategoriesContext";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { toast } from "sonner";

jest.mock("../contexts/AuthContext", () => ({
  useAuth: jest.fn(),
}));
jest.mock("../lib/api", () => ({
  api: {
    swrGet: jest.fn(),
    invalidate: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  formatApiError: jest.fn((error) => error?.message || "API error"),
}));
jest.mock("../lib/cache", () => ({
  cacheGetEntry: jest.fn(() => null),
}));
jest.mock("sonner", () => ({
  toast: { error: jest.fn() },
}));

function Probe() {
  const { categories, error } = useCategories();
  return (
    <div>
      <span data-testid="category-count">{categories.length}</span>
      <span data-testid="category-error">{error}</span>
    </div>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({
    user: { user_id: "user-1", name: "Cached profile" },
    loading: false,
  });
});

test("a failed background category load does not show a generic toast on app open", async () => {
  api.swrGet.mockReturnValue({
    fresh: Promise.reject(new Error("network unavailable")),
  });

  render(
    <CategoriesProvider>
      <Probe />
    </CategoriesProvider>,
  );

  await waitFor(() => {
    expect(screen.getByTestId("category-error")).toHaveTextContent("network unavailable");
  });
  expect(toast.error).not.toHaveBeenCalled();
  expect(api.swrGet).toHaveBeenCalledTimes(1);
});

test("refreshing the auth profile for the same user does not reload categories twice", async () => {
  let resolveRequest;
  api.swrGet.mockReturnValue({
    fresh: new Promise((resolve) => {
      resolveRequest = resolve;
    }),
  });

  const view = render(
    <CategoriesProvider>
      <Probe />
    </CategoriesProvider>,
  );

  await waitFor(() => expect(api.swrGet).toHaveBeenCalledTimes(1));

  useAuth.mockReturnValue({
    user: { user_id: "user-1", name: "Fresh profile object" },
    loading: false,
  });
  view.rerender(
    <CategoriesProvider>
      <Probe />
    </CategoriesProvider>,
  );

  expect(api.swrGet).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveRequest({ data: { categories: [], hierarchy: {} } });
  });
  await waitFor(() => expect(screen.getByTestId("category-error")).toBeEmptyDOMElement());
});
