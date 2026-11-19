import {runOptimisticTransactionSave} from "../lib/optimisticTransactionSave";
const base={transaction_id:"tx-1",date:"2026-11-19",amount:-10,category:"grocery"};
test("edits show a pending row immediately and confirm once the server responds",async()=>{
  let resolve;
  const persist=jest.fn(()=>new Promise(r=>{resolve=r;}));
  const emit=jest.fn();
  const task=runOptimisticTransactionSave({
    kind:"updated",optimistic:{...base,amount:-15},original:base,persist,emit,
  });
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({phase:"optimistic",record:expect.objectContaining({_saveStatus:"saving",amount:-15})}));
  await Promise.resolve();
  resolve({...base,amount:-15});
  await task;
  expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({phase:"confirmed",record:expect.objectContaining({_saveStatus:null,amount:-15})}));
});
test("a failed edit restores the original record and never claims success",async()=>{
  const emit=jest.fn(),saved=jest.fn(),failed=jest.fn();
  await runOptimisticTransactionSave({
    kind:"updated",optimistic:{...base,amount:-55},original:base,
    persist:()=>Promise.reject(new Error("Offline")),emit,onSaved:saved,onFailure:failed,
  });
  expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({phase:"rolled-back",record:expect.objectContaining({amount:-10,_saveStatus:null})}));
  expect(saved).not.toHaveBeenCalled();
  expect(failed).toHaveBeenCalledTimes(1);
});
test("new transaction uses temporary id until confirmed and is removed on failure",async()=>{
  const emit=jest.fn();
  await runOptimisticTransactionSave({
    kind:"created",optimistic:{...base,transaction_id:"local_tx_1"},persist:()=>Promise.resolve({...base,transaction_id:"tx-new"}),emit,
  });
  expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({operation:"created-confirmed",clientId:"local_tx_1",record:expect.objectContaining({transaction_id:"tx-new"})}));
  emit.mockClear();
  await runOptimisticTransactionSave({
    kind:"created",optimistic:{...base,transaction_id:"local_tx_2"},persist:()=>Promise.reject(new Error("Timeout")),emit,
  });
  expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({operation:"created-rolled-back",clientId:"local_tx_2"}));
});
