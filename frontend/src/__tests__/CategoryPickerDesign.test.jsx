import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import CategoryCombobox from "../components/CategoryCombobox";

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = jest.fn();
});

const categories = [
  { name: "paper_goods", label: "Paper goods and household essentials", emoji: "🧻", section: "Everyday", color: "#d97706" },
  { name: "meat", label: "Meat", emoji: "🥩", section: "Everyday", color: "#ee3333" },
];

jest.mock("../contexts/CategoriesContext", () => ({
  useCategories: () => ({
    sectionOptions:["Everyday","Other"],
    categories: [
      { name: "paper_goods", label: "Paper goods and household essentials", emoji: "🧻", section: "Everyday", color: "#d97706" },
      { name: "meat", label: "Meat", emoji: "🥩", section: "Everyday", color: "#ee3333" },
    ],
    resolveCategory: name => ({
      name,
      label: name === "paper_goods" ? "Paper goods and household essentials" : "Meat",
      emoji: name === "paper_goods" ? "🧻" : "🥩",
      color: "#ee3333",
    }),
    createCategory: jest.fn(),
  }),
}));

test("category dropdown is wide and displays full labels as neutral rows with emoji", () => {
  const change = jest.fn();
  render(<CategoryCombobox value="" categories={categories} onChange={change} placeholder="All Categories" label="Filter category" allowClear />);
  fireEvent.click(screen.getByRole("combobox",{name:"Filter category"}));
  const popover = document.querySelector(".penni-category-menu");
  expect(popover).toBeTruthy();
  expect(popover.className).toContain("360px");
  const category = screen.getByText("Paper goods and household essentials");
  expect(category).toBeInTheDocument();
  expect(within(category.closest("[cmdk-item]")).getByText("🧻")).toBeInTheDocument();
  expect(category).toHaveClass("whitespace-normal", {exact:false});
  expect(popover.querySelectorAll(".rounded-full[style]")).toHaveLength(0);
  fireEvent.click(category.closest("[cmdk-item]"));
  expect(change).toHaveBeenCalledWith("paper_goods");
});

test("selected category has plain text and emoji, not a filled colour pill", () => {
  render(<CategoryCombobox value="meat" categories={categories} onChange={()=>{}} label="Category" />);
  const trigger=screen.getByRole("combobox",{name:"Category"});
  expect(within(trigger).getByText("Meat")).toBeInTheDocument();
  expect(within(trigger).getByText("🥩")).toBeInTheDocument();
  expect(trigger).toHaveClass("bg-card", {exact:false});
  expect(trigger.querySelector("[style]")).toBeNull();
});
