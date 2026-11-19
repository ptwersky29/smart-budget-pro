import {patchTransactionRows,insertTransactionRow,matchesTransactionFilters} from "../lib/transactionUpdates";
const first={transaction_id:"tx1",date:"2026-11-01",amount:-20,description:"Old",category:"grocery",account_id:"acc"};
const second={transaction_id:"tx2",date:"2026-11-02",amount:-10,description:"Other",category:"uncategorized",account_id:"acc"};
test("edit changes one row and keeps other row identity and order",()=>{
  const rows=patchTransactionRows([first,second],{transaction_id:"tx1",description:"New",amount:-22});
  expect(rows.map(r=>r.transaction_id)).toEqual(["tx1","tx2"]);
  expect(rows[0]).toMatchObject({description:"New",amount:-22,category:"grocery"});
  expect(rows[1]).toBe(second);
});
test("late AI result does not overwrite an already chosen category",()=>{
  expect(patchTransactionRows([first],{transaction_id:"tx1",category:"taxi"},{onlyIfUncategorized:true})[0].category).toBe("grocery");
  expect(patchTransactionRows([second],{transaction_id:"tx2",category:"taxi"},{onlyIfUncategorized:true})[0].category).toBe("taxi");
});
test("new transactions appear only in their matching filtered view",()=>{
  const filters={date_from:"2026-11-01",date_to:"2026-11-30",account_id:"acc",sort:"date",order:"desc"};
  const added={...first,transaction_id:"tx3",date:"2026-11-09"};
  expect(matchesTransactionFilters(added,filters)).toBe(true);
  expect(insertTransactionRow([first,second],added,filters).map(r=>r.transaction_id)).toEqual(["tx3","tx2","tx1"]);
  expect(insertTransactionRow([first,second],{...added,account_id:"other"},filters)).toEqual([first,second]);
});
