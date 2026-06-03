import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmModal from "../components/ui/ConfirmModal";

test("renders with title and message", () => {
  render(<ConfirmModal open title="Delete?" message="Are you sure?" onConfirm={() => {}} onCancel={() => {}} />);
  expect(screen.getByText("Delete?")).toBeInTheDocument();
  expect(screen.getByText("Are you sure?")).toBeInTheDocument();
});

test("calls onConfirm when confirm button clicked", () => {
  const onConfirm = jest.fn();
  render(<ConfirmModal open title="Confirm" message="Test" onConfirm={onConfirm} onCancel={() => {}} />);
  fireEvent.click(screen.getByText("Delete"));
  expect(onConfirm).toHaveBeenCalled();
});

test("calls onCancel when cancel button clicked", () => {
  const onCancel = jest.fn();
  render(<ConfirmModal open title="Confirm" message="Test" onConfirm={() => {}} onCancel={onCancel} />);
  fireEvent.click(screen.getByText("Cancel"));
  expect(onCancel).toHaveBeenCalled();
});

test("does not render when closed", () => {
  render(<ConfirmModal open={false} title="Hidden" message="Should not show" onConfirm={() => {}} onCancel={() => {}} />);
  expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
});
