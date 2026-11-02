import { api } from "./api";

/**
 * Retrieve every row matching an API filter instead of silently counting only
 * the first page. Use only for bounded analytical views (e.g. one month).
 */
export async function fetchAllTransactions(params = {}) {
  const pageSize = 1000;
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data } = await api.get("/transactions", {
      params: { ...params, offset, limit: pageSize },
    });
    const page = data.transactions || [];
    rows.push(...page);
    offset += page.length;
    if (!page.length || (Number.isFinite(Number(data.total)) && offset >= Number(data.total)) ||
        page.length < pageSize) return rows;
  }
}
