import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import DemoApp from "../pages/DemoApp";

describe("Read-only public demo interaction", () => {
  test("visitors can explore without logging in; mutation buttons are disabled", () => {
    render(<MemoryRouter initialEntries={["/demo/transactions"]}><DemoApp/></MemoryRouter>);
    expect(screen.getByTestId("public-demo")).toHaveAttribute("data-demo-mode","read-only");
    expect(screen.getByTestId("demo-read-only-banner")).toHaveTextContent(/read-only demo/i);
    expect(screen.getByRole("button",{name:"Add transaction disabled in demo"})).toBeDisabled();
    expect(screen.getAllByRole("link",{name:/Dashboard/}).length).toBeGreaterThan(0);
    expect(screen.getByText("Monthly salary")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox",{name:"Search demo transactions"}),{target:{value:"Groceries"}});
    expect(screen.getByText("Food shopping")).toBeInTheDocument();
    expect(screen.queryByText("Monthly salary")).not.toBeInTheDocument();
  });
});
