/**
 * Approximate account balance history from currently linked account balances
 * and the recorded transactions in the chosen period. Values are estimates,
 * not bank statement opening balances. End value is authoritative current balance.
 */
export function buildDailyBalanceTrend(transactions = [], currentBalance = 0, rangeDays = 90, now = new Date(), includedIds = []) {
  const dateKey = date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");
  const accounts = new Set(includedIds.map(String));
  const totals = new Map();
  for(const tx of transactions) {
    if (!tx || tx.pending || (accounts.size && !accounts.has(String(tx.account_id)))) continue;
    const amount = Number(tx.amount);
    const day = String(tx.date || "").slice(0,10);
    if(!Number.isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(day))continue;
    totals.set(day,(totals.get(day)||0)+amount);
  }
  let balance = Number(currentBalance)||0;
  const pointCount=Math.max(1,Math.min(366,Number(rangeDays)||90));
  const result=[];
  for(let i=0;i<pointCount;i++) {
    const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);
    const day=dateKey(date);
    result.push({date:day,balance:Math.round(balance*100)/100});
    balance -= totals.get(day)||0;
  }
  return result.reverse();
}

export function monthPaceForecast(spend,now=new Date()) {
  const d=now.getDate(),days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  return {monthDays:days,day:d,daysLeft:Math.max(0,days-d), projected: d?((Number(spend)||0)/d)*days:0};
}
