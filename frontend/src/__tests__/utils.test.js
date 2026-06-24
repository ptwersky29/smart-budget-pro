import { cn } from "../lib/utils";

test("joins class names", () => {
  expect(cn("foo", "bar")).toBe("foo bar");
});

test("handles conditional classes via clsx", () => {
  expect(cn("base", false && "hidden", true && "visible")).toBe("base visible");
});

test("handles undefined and null values", () => {
  expect(cn("a", undefined, null, "b")).toBe("a b");
});

test("twMerge merges tailwind classes correctly", () => {
  expect(cn("px-4", "px-6")).toBe("px-6");
});

test("returns empty string for no input", () => {
  expect(cn()).toBe("");
});
