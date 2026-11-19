import { canPairTransactions, isPotentialOppositeSide } from "../lib/transferPairing";

const outgoing = { transaction_id: "t1", account_id: "trading212", amount: -815, currency: "GBP" };
const incoming = { transaction_id: "t2", account_id: "savings", amount: 815, currency: "GBP" };

test("can pair equal opposite sides from two accounts", () => {
  expect(canPairTransactions(outgoing, incoming)).toBe(true);
});
test("same account is a possible-looking match but must not be offered", () => {
  const same = {...incoming, account_id: outgoing.account_id};
  expect(isPotentialOppositeSide(outgoing, same)).toBe(true);
  expect(canPairTransactions(outgoing, same)).toBe(false);
});
test("different amount, same sign or currency cannot pair", () => {
  expect(canPairTransactions(outgoing, {...incoming, amount: 815.25})).toBe(false);
  expect(canPairTransactions(outgoing, {...incoming, amount: -815})).toBe(false);
  expect(canPairTransactions(outgoing, {...incoming, currency:"USD"})).toBe(false);
});
test("already paired transactions and self pairs are excluded", () => {
  expect(canPairTransactions(outgoing, {...incoming, transfer_pair_id:"pair1"})).toBe(false);
  expect(canPairTransactions(outgoing, outgoing)).toBe(false);
});
