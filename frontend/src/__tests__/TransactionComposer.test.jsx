import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ActionProvider, useActions } from "../contexts/ActionContext";
import GlobalActionHost from "../components/actions/GlobalActionHost";
import { api } from "../lib/api";

jest.mock("../contexts/CategoriesContext", () => ({
  useCategories: () => ({categories: [
    {name:"groceries",label:"Groceries"},
    {name:"household",label:"Household"},
    {name:"transport",label:"Transport"},
  ], resolveCategory:name=>({name,label:name}),createCategory:jest.fn()}),
}));
jest.mock("../components/CategoryCombobox", () => {
  const ReactMock = require("react");
  return {__esModule:true,default:({label="Category",value,onChange,categories=[]}) =>
    ReactMock.createElement("select", {"aria-label":label,value:value||"",onChange:e=>onChange(e.target.value)},
      [ReactMock.createElement("option",{key:"",value:""},"Choose category"),
        ...categories.map(c=>ReactMock.createElement("option",{key:c.name,value:c.name},c.label))])};
});
jest.mock("../lib/api", () => ({
  api:{get:jest.fn(),post:jest.fn(),put:jest.fn(),patch:jest.fn(),delete:jest.fn()},
  formatApiError:()=>"Could not save transaction",
}));
function Launcher(){const {openAction}=useActions();return <button onClick={()=>openAction("transaction-new")}>New transaction</button>}
const accounts=[
  {account_id:"a1",name:"Current",balance:100,currency:"GBP"},
  {account_id:"a2",name:"Savings",balance:200,currency:"GBP"},
];
beforeEach(()=>{
  jest.clearAllMocks();
  api.get.mockImplementation(url=>url==="/accounts"
    ? Promise.resolve({data:{accounts}}) : Promise.resolve({data:{transactions:[],total:0}}));
  api.post.mockResolvedValue({data:{ok:true,transaction_id:"tx-1"}});
  api.put.mockResolvedValue({data:{ok:true}});
});
function open(){render(<ActionProvider><Launcher/><GlobalActionHost/></ActionProvider>);fireEvent.click(screen.getByRole("button",{name:"New transaction"}));return screen.getByRole("dialog",{name:"New transaction"});}

test("split composer supports three categories with one atomic save and no extra action", async ()=>{
  const dialog=open();
  await waitFor(()=>expect(api.get).toHaveBeenCalledWith("/accounts"));
  fireEvent.click(within(dialog).getByRole("button",{name:"Split"}));
  fireEvent.change(screen.getByTestId("tx-amount"),{target:{value:"125"}});
  fireEvent.change(screen.getByTestId("tx-desc"),{target:{value:"Groceries and transport"}});
  fireEvent.click(within(dialog).getByRole("button",{name:/Add another category/i}));
  expect(within(dialog).getAllByRole("combobox",{name:/Category for split/})).toHaveLength(3);
  for(const [i,cat,amount] of [[1,"groceries","55"],[2,"household","40"],[3,"transport","30"]]){
    fireEvent.change(screen.getByRole("combobox",{name:`Category for split ${i}`}),{target:{value:cat}});
    fireEvent.change(screen.getByRole("spinbutton",{name:`Amount for split ${i}`}),{target:{value:amount}});
  }
  fireEvent.click(screen.getByRole("combobox",{name:"Choose option"}));
  fireEvent.click(screen.getByRole("option",{name:/Current/}));
  expect(screen.getByTestId("tx-submit")).not.toBeDisabled();
  fireEvent.click(screen.getByTestId("tx-submit"));
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith("/transactions/split-create",expect.objectContaining({
    amount:-125,account_id:"a1",splits:[
      expect.objectContaining({category:"groceries",amount:55}),
      expect.objectContaining({category:"household",amount:40}),
      expect.objectContaining({category:"transport",amount:30}),
    ],
  })));
  expect(api.post).toHaveBeenCalledTimes(1);
});

test("split cannot save unless every allocation adds up and removing a third row works",()=>{
  open();
  fireEvent.click(screen.getByRole("button",{name:"Split"}));
  fireEvent.change(screen.getByTestId("tx-amount"),{target:{value:"100"}});
  fireEvent.click(screen.getByRole("button",{name:/Add another category/i}));
  expect(screen.getAllByRole("combobox",{name:/Category for split/})).toHaveLength(3);
  expect(screen.getByTestId("tx-submit")).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Remove split 3"}));
  expect(screen.getAllByRole("combobox",{name:/Category for split/})).toHaveLength(2);
  expect(api.post).not.toHaveBeenCalled();
});

test("transfer creates one linked pair through the atomic transfer API",async()=>{
  open();
  fireEvent.click(screen.getByRole("button",{name:"Transfer"}));
  fireEvent.change(screen.getByTestId("tx-amount"),{target:{value:"60.50"}});
  await waitFor(()=>expect(document.getElementById("tx-account")).toBeInTheDocument());
  fireEvent.click(document.getElementById("tx-account"));
  fireEvent.click(screen.getByRole("option",{name:/Current/}));
  fireEvent.click(document.getElementById("tx-to-account"));
  fireEvent.click(screen.getByRole("option",{name:/Savings/}));
  fireEvent.click(screen.getByTestId("tx-submit"));
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith("/transactions/transfer-create",expect.objectContaining({
    from_account_id:"a1",to_account_id:"a2",amount:60.5,
  })));
  expect(api.post).toHaveBeenCalledTimes(1);
});
