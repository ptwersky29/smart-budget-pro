import React from "react";
import { render } from "@testing-library/react";
import Skeleton, { SkeletonCard, SkeletonChart, SkeletonTable } from "../components/ui/Skeleton";

test("Skeleton renders with animate-pulse", () => {
  const { container } = render(<Skeleton className="h-4 w-20" />);
  expect(container.firstChild).toHaveClass("animate-pulse");
});

test("SkeletonCard renders with shadow-card", () => {
  const { container } = render(<SkeletonCard />);
  expect(container.firstChild).toHaveClass("shadow-card");
});

test("SkeletonChart renders with rounded-2xl", () => {
  const { container } = render(<SkeletonChart />);
  expect(container.firstChild).toHaveClass("rounded-2xl");
});

test("SkeletonTable renders 5 rows by default", () => {
  const { container } = render(<SkeletonTable />);
  const rows = container.querySelectorAll(".flex.items-center.space-x-4");
  expect(rows.length).toBe(5);
});
