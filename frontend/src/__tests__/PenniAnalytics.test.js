import { summarizeTrends } from "../lib/analyticsSummary";
import { ACCOUNT_GRADIENTS, accountGradient } from "../design-system/account-gradients";

test("analytics totals preserve signed net savings and avoid divide-by-zero", () => {
  const result = summarizeTrends([{income: 2000, spend: 1200}, {income: 800, spend: 1000}]);
  expect(result).toEqual({income: 2800, spending: 2200, saved: 600, savingsRate: (600 / 2800) * 100});
  expect(summarizeTrends([]).savingsRate).toBe(0);
});
test("account cards stay visually stable when order or data changes", () => {
  expect(accountGradient({account_id:"a1", balance:10})).toBe(accountGradient({account_id:"a1", balance:999}));
  expect(ACCOUNT_GRADIENTS).toHaveLength(7);
  expect(ACCOUNT_GRADIENTS).toContain(accountGradient({account_id:"a1"}));
});
