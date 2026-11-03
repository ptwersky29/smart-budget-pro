// Pure selectors keep report calculations independently testable.
export function summarizeTrends(trends = []) {
  const result = trends.reduce((acc, item) => {
    acc.income += Math.max(0, Number(item.income) || 0);
    acc.spending += Math.max(0, Number(item.spend ?? item.spending) || 0);
    return acc;
  }, { income: 0, spending: 0 });
  const saved = result.income - result.spending;
  return {
    ...result, saved,
    savingsRate: result.income > 0 ? (saved / result.income) * 100 : 0,
  };
}
