import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CategoryCombobox from "../components/CategoryCombobox";
import { useCategories } from "../contexts/CategoriesContext";
import { buildFallbackCategory } from "../lib/categories";

jest.mock("../contexts/CategoriesContext", () => ({
  useCategories: jest.fn(),
}));

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  useCategories.mockReturnValue({
    categories: [],
    sectionOptions: ["❤️ Charity", "👕 Clothing", "🏠 Household"],
    loading: false,
    resolveCategory: (name) => buildFallbackCategory(name),
    refreshCategories: jest.fn().mockResolvedValue({ categories: [], hierarchy: {} }),
    createCategory: jest.fn(),
  });
});

test("standard categories stay visible while the account list is empty", () => {
  const onChange = jest.fn();
  render(<CategoryCombobox value="" categories={[]} onChange={onChange} />);
  fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
  expect(screen.getByText("Standard categories shown")).toBeInTheDocument();
  expect(screen.getByText("Clothing Wife")).toBeInTheDocument();
  expect(screen.getByText("Grocery")).toBeInTheDocument();
  expect(document.querySelectorAll("[cmdk-item]").length).toBeGreaterThan(50);
  fireEvent.click(screen.getByText("Grocery").closest("[cmdk-item]"));
  expect(onChange).toHaveBeenCalledWith("grocery");
});

test("search works with the fallback category list", () => {
  render(<CategoryCombobox value="clothing_wife" categories={[]} onChange={() => {}} />);
  fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
  fireEvent.change(screen.getByPlaceholderText("Search categories…"), {
    target: { value: "petrol" },
  });
  expect(screen.getByText("Petrol Diesel")).toBeInTheDocument();
  expect(screen.queryByText("Grocery")).not.toBeInTheDocument();
});
