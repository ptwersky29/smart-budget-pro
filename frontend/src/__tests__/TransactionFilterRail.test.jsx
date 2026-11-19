import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import TransactionFilterRail from "../components/TransactionFilterRail";
jest.mock("../components/CategoryCombobox",()=> function MockCategory({onChange}) {
  return <button type="button" onClick={()=>onChange("grocery")}>Choose groceries</button>;
});
const initial = { account_id:"", category:"", approval_status:"", date_from:"2026-11-01", date_to:"2026-11-30" };
test("quick views and sidebar account filters update without navigation",()=>{
  const onViewChange=jest.fn(), onFilterChange=jest.fn(), onClose=jest.fn();
  render(<TransactionFilterRail filters={initial}
    accounts={[{account_id:"acc1",name:"Lloyds"}]} categories={[]}
    activeView="all" counts={{all:10,unapproved:2,uncategorized:1,transfers:3}}
    onFilterChange={onFilterChange} onViewChange={onViewChange}
    onClear={()=>{}} onClose={onClose} onClassify={()=>{}} />);
  expect(screen.getByRole("region",{name:"Transaction filter sidebar"})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:/Needs review/}));
  expect(onViewChange).toHaveBeenCalledWith("unapproved");
  fireEvent.change(screen.getByRole("combobox",{name:"Filter account in sidebar"}), {target:{value:"acc1"}});
  expect(onFilterChange).toHaveBeenCalledWith("account_id","acc1");
  fireEvent.click(screen.getByText("Choose groceries"));
  expect(onFilterChange).toHaveBeenCalledWith("category","grocery");
  fireEvent.click(screen.getByRole("button",{name:"Collapse filter sidebar"}));
  expect(onClose).toHaveBeenCalledTimes(1);
});
