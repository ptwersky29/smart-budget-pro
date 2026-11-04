/** Normalize recurring subscription amounts to a common year and month.
 * Display-only calculations: never modify stored amounts or billing frequency.
 */
export function annualSubscriptionAmount(subscription) {
  const amount = Math.abs(Number(subscription?.amount) || 0);
  const frequency = String(subscription?.frequency || "monthly").toLowerCase();
  const periodsPerYear = {
    daily: 365,
    weekly: 52,
    biweekly: 26,
    fortnightly: 26,
    monthly: 12,
    quarterly: 4,
    semiannually: 2,
    semiannual: 2,
    half_yearly: 2,
    annually: 1,
    annual: 1,
    yearly: 1,
  };
  return amount * (periodsPerYear[frequency] ?? 12);
}

export function monthlySubscriptionAmount(subscription) {
  return annualSubscriptionAmount(subscription) / 12;
}
