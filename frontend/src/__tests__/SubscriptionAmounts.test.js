import { annualSubscriptionAmount, monthlySubscriptionAmount } from "../lib/subscriptionAmounts";

describe("recurring subscription summaries use the true billing cadence", () => {
  test.each([
    ["weekly", 10, 520],
    ["biweekly", 10, 260],
    ["fortnightly", 10, 260],
    ["monthly", 10, 120],
    ["quarterly", 10, 40],
    ["annually", 10, 10],
    ["yearly", 10, 10],
    ["semiannual", 10, 20],
  ])("%s cadence annualises correctly", (frequency, amount, expected) => {
    const subscription = {frequency,amount};
    expect(annualSubscriptionAmount(subscription)).toBe(expected);
    expect(monthlySubscriptionAmount(subscription)).toBeCloseTo(expected / 12);
  });
  test("ignores the sign of debit and normalizes missing or invalid amounts", () => {
    expect(monthlySubscriptionAmount({ amount: -12, frequency: "monthly" })).toBe(12);
    expect(monthlySubscriptionAmount({ amount: "invalid", frequency: "weekly" })).toBe(0);
  });
});
