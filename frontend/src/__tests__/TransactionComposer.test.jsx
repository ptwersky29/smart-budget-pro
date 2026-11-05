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
  {account_id:"a2",name:"Savings",balance:200,cu¶»§q«^