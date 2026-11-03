import { buildDailyBalanceTrend, monthPaceForecast } from "../lib/balanceTrend";
test("balance history uses real account-linked transactions and authoritative ending balance",()=>{
 const now=new Date(2026,10,3);
 const data=buildDailyBalanceTrend([
  {date:"2026-11-03",amount:-30,account_id:"a"},
  {date:"2026-11-02",amount:200,account_id:"a"},
  {date:"2026-11-03",amount:500,account_id:"excluded"},
 ],1000,3,now,["a"]);
 expect(data.map(x=>x.balance)).toEqual([830,1030,1000]);
});
test("month-end estimate is clearly derived from current pace",()=>{
 const p=monthPaceForecast(60,new Date(2026,10,3));
 expect(p.projected).toBe(600);
 expect(p.daysLeft).toBe(27);
});
