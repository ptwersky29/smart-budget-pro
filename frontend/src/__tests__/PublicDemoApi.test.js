import { api } from "../lib/api";
import { DEMO_SESSION_KEY } from "../lib/demoSession";

describe("real offline app public demo blocks remote and write operations", () => {
  beforeEach(() => { window.sessionStorage.setItem(DEMO_SESSION_KEY,"true"); });
  afterEach(() => { window.sessionStorage.removeItem(DEMO_SESSION_KEY); });
  test("financial views use synthetic offline responses", async () => {
    const dashboard = await api.get("/dashboard/overview");
    expect(dashboard.headers["x-penni-demo"]).toBe("read-only");
    expect(dashboard.data.accounts[0].account_id).toBe("demo-current");
    const accounts = await api.get("/accounts");
    expect(accounts.data.accounts[0].is_offline).toBe(true);
    const transactions = await api.get("/transactions");
    expect(transactions.data.transactions[0].transaction_id).toMatch(/^demo-/);
  });
  test.each([["post","/transactions"],["put","/settings/app"],["patch","/transactions/demo-1"],["delete","/budgets/demo-budget-0"]])("%s %s is blocked", async (method,url) => {
    await expect(api[method](url,{amount:1})).rejects.toMatchObject({code:"PENNI_DEMO_READ_ONLY",response:{status:403}});
  });
  test("cachedGet bypasses private in-memory API cache", async () => {
    const data=await api.cachedGet("/accounts");
    expect(data.accounts[0].account_id).toBe("demo-current");
  });
});
