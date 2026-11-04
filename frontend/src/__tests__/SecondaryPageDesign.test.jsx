import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PageHeader } from "../components/ui/page";
import { SectionCard } from "../components/ui/layout";
import { WorkspaceTabs } from "../components/ui/workspace";
import fs from "fs";
import path from "path";

const src = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

describe("secondary workspace design contracts", () => {
  test("title-only page headings yield to the persistent desktop app heading", () => {
    const { container, rerender } = render(<PageHeader title="Statements" description="Upload files" />);
    expect(container.firstChild).toHaveClass("penni-page-heading-only");
    rerender(<PageHeader title="Reports" actions={<button type="button">Export</button>} />);
    expect(container.firstChild).not.toHaveClass("penni-page-heading-only");
  });

  test("flush cards do not inherit desktop padding that crowds tables", () => {
    render(<SectionCard title="Subscriptions" contentClassName="p-0">
      <div data-testid="ledger">Rows</div>
    </SectionCard>);
    const content = screen.getByTestId("ledger").parentElement;
    expect(content).toHaveClass("p-0");
    expect(content).not.toHaveClass("sm:p-5");
  });

  test("workspace tabs don't render empty count pills and keep accessible selection", () => {
    const onChange = jest.fn();
    render(<WorkspaceTabs tabs={[
      { key: "all", label: "All" },
      { key: "paused", label: "Paused", count: 0 },
    ]} active="all" onChange={onChange} />);
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "All" }).querySelector("span")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Paused/ }));
    expect(onChange).toHaveBeenCalledWith("paused");
  });

  test("Subscriptions uses shared metric cards, table density and a non-submitting Cancel", () => {
    const code = src("pages/Subscriptions.jsx");
    expect(code).toContain("<StatCard");
    expect(code).toContain('className="penni-data-table"');
    expect(code).toContain('type="button" variant="outlinePill" onClick={() => setOpen(false)}');
    expect(code).toContain("<CategoryCombobox");
  });

  test("Integrations has a standalone page heading and labelled provider fields", () => {
    const code = src("pages/Integrations.jsx");
    expect(code).toContain("!embedded && <PageHeader");
    expect(code).toContain('className="surface min-w-0 p-4 sm:p-5"');
    expect(code).toContain('htmlFor={fieldId}');
    expect(code).toContain('aria-label="AI provider"');
  });

  test("Transaction rows are keyboard reachable and use readable financial text", () => {
    const code = src("components/TransactionRow.jsx");
    expect(code).toContain("tabIndex={0}");
    expect(code).toContain('event.key === "Enter" || event.key === " "');
    expect(code).toContain('text-[13px] font-semibold');
  });

  test("Statements exposes keyboard upload and eight semantic edit buttons", () => {
    const code = src("pages/Statements.jsx");
    expect(code).toContain('aria-label="Upload a PDF or CSV statement"');
    expect(code).toContain('role="button"');
    expect(code).toContain('onKeyDown={(event)');
    expect(code).toContain('className="penni-data-table"');
    expect((code.match(/type="button" aria-label={`Edit (date|description|amount|category) for/g) || []).length).toBe(8);
    expect(code).toContain("<ConfirmModal open={Boolean(pendingRemovalId)}");
  });
});
