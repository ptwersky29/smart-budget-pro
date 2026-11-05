import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import NativePopup from "../components/ui/NativePopup";
import AccountFormModal from "../components/AccountFormModal";
import KeyboardShortcutsHelp from "../components/KeyboardShortcutsHelp";
import RecurringTransactionManager from "../components/RecurringTransactionManager";
import CategoryEditorDialog from "../components/CategoryEditorDialog";
import { api } from "../lib/api";

jest.mock("../lib/api", () => ({
  api: {get:jest.fn(),post:jest.fn(),put:jest.fn(),delete:jest.fn()},
  formatApiError: () => "Could not save",
}));
jest.mock("../contexts/CategoriesContext", () => {
  const stableSectionOptions = ["Everyday","Other"];
  return ({
  useCategories: () => ({
    sectionOptions: stableSectionOptions,
    categories:[{name:"groceries", label:"Groceries", color:"#5b5cf0"}],
    resolveCategory: name => ({name,label:name}),
    createCategory:jest.fn(),
  }),
  });
});
jest.mock("../components/CategoryCombobox", () => {
  const R = require("react");
  return {
    __esModule: true,
    default: ({value, onChange, placeholder}) => R.createElement("select", {
      value:value || "", onChange:event=>onChange(event.target.value),
      "aria-label":placeholder || "Category",
    }, [
      R.createElement("option",{key:"",value:""},"Select category"),
      R.createElement("option",{key:"groceries",value:"groceries"},"Groceries"),
    ]),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(url => url === "/categories"
    ? Promise.resolve({data:{categories:[]}})
    : Promise.resolve({data:{items:[]}}));
  api.post.mockResolvedValue({data:{name:"Current account"}});
  api.put.mockResolvedValue({data:{}});
});

test("native popup shares an accessible header and an always-present action area", () => {
  const onClose = jest.fn();
  render(<NativePopup open title="New account" description="Account details"
    onClose={onClose} showHeader
    footer={<button type="submit" form="test-popup-form">Save</button>}>
    <form id="test-popup-form" onSubmit={event => event.preventDefault()}>
      <label htmlFor="demo-name">Name</label>
      <input id="demo-name" />
    </form>
  </NativePopup>);
  const dialog = screen.getByRole("dialog", {name:"New account"});
  expect(dialog).toHaveAttribute("data-penni-kind","modal");
  expect(within(dialog).getByText("Account details")).toBeVisible();
  expect(within(dialog).getByRole("button",{name:"Save"})).toHaveAttribute("form","test-popup-form");
  fireEvent.click(within(dialog).getByRole("button",{name:"Close dialog"}));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("account editor has one header and saves through its fixed footer", async () => {
  const onCreated=jest.fn();
  const onClose=jest.fn();
  render(<AccountFormModal open onCreated={onCreated} onClose={onClose}/>);
  const dialog=screen.getByRole("dialog",{name:"New account"});
  expect(within(dialog).getAllByRole("heading",{name:"New account"})).toHaveLength(1);
  fireEvent.change(within(dialog).getByPlaceholderText("e.g. HSBC Main Account"),{target:{value:"Current account"}});
  fireEvent.click(within(dialog).getByRole("button",{name:"Create account"}));
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith("/accounts",expect.objectContaining({
    name:"Current account",type:"current",balance:null,
  })));
  await waitFor(()=>expect(onCreated).toHaveBeenCalledTimes(1));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("keyboard shortcuts now use the native accessible dialog", () => {
  const onClose=jest.fn();
  render(<KeyboardShortcutsHelp open onClose={onClose}/>);
  const dialog=screen.getByRole("dialog",{name:"Keyboard shortcuts"});
  expect(within(dialog).getByText("Command palette")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button",{name:"Done"}));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("recurring editor keeps form behaviour and the shared fixed footer",async()=>{
  render(<RecurringTransactionManager/>);
  await waitFor(()=>expect(api.get).toHaveBeenCalledWith("/transactions/recurring"));
  fireEvent.click(screen.getByRole("button",{name:"Add recurring"}));
  const dialog=screen.getByRole("dialog",{name:"New recurring transaction"});
  expect(dialog).toBeVisible();
  expect(within(dialog).getByRole("button",{name:"Add recurring"})).toHaveAttribute("form","penni-recurring-editor");
  fireEvent.change(within(dialog).getByPlaceholderText("e.g., Monthly rent"),{target:{value:"Rent"}});
  fireEvent.change(within(dialog).getByPlaceholderText("0.00"),{target:{value:"50"}});
  fireEvent.change(within(dialog).getByRole("combobox",{name:"Select category…"}),{target:{value:"groceries"}});
  fireEvent.click(within(dialog).getByRole("button",{name:"Add recurring"}));
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith("/transactions/recurring",expect.objectContaining({
    description:"Rent",amount:50,category:"groceries",frequency:"monthly",
  })));
});

test("category editor retains emoji and colour selection using shared popup", async()=>{
  const onSave=jest.fn().mockResolvedValue(undefined);
  render(<CategoryEditorDialog open onOpenChange={jest.fn()} onSave={onSave}/>);
  const dialog=screen.getByRole("dialog",{name:"Create category"});
  expect(dialog).toBeVisible();
  const name=within(dialog).getByPlaceholderText("e.g. Public Transport");
  fireEvent.change(name,{target:{value:"Personal travel"}});
  fireEvent.click(within(dialog).getByRole("button",{name:"Create category"}));
  await waitFor(()=>expect(onSave).toHaveBeenCalledWith(expect.objectContaining({name:"Personal travel"})));
});
