const { test } = require("@playwright/test");
const { installApiMocks } = require("./fixtures/mockApi");
const tx = (id, date, description, merchant, amount, category, approval = "unapproved", extra = {}) => ({ transaction_id:id,date,description,merchant,normalized_merchant:merchant,amount,category,approval_status:approval,category_approval_status:approval,is_income:amount>0,is_transfer:false,source:"manual",source_label:"Barclays",institution:"Barclays",account_id:"acct_main",currency:"GBP",created_at:`${date}T15:24:00Z`,...extra });
const rows = [tx("t1","2026-10-20","TFL TRAVEL CH ON 20 OCT CLP","Transport for London",-1.75,"public_transport")];
test("measure", async ({page}) => {
  await page.setViewportSize({width:1536,height:1024});
  await page.clock.setFixedTime(new Date("2026-10-20T12:00:00Z"));
  await installApiMocks(page);
  await page.route("**/api/transactions?*", async r => { if(r.request().method()!=="GET") return r.fallback(); await r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({transactions:rows,total:rows.length,income_total:2300,expense_total:1422.73})}); });
  await page.goto("/transactions");
  await page.waitForTimeout(800);
  console.log(await page.evaluate(() => Array.from(document.querySelectorAll("[data-testid='transactions-root'] .flex.flex-wrap.items-center.gap-2 > *")).map(e => { const r=e.getBoundingClientRect(); return {tag:e.tagName,text:e.innerText?.slice(0,30),x:r.x,y:r.y,w:r.width,h:r.height}; })));
  console.log(await page.evaluate(() => Array.from(document.querySelectorAll("[data-testid='transactions-root'] tbody tr")).slice(0,3).map(e => { const r=e.getBoundingClientRect(); return {h:r.height,y:r.y}; })));
});
