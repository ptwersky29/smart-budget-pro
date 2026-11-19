/** Patch confirmed server edits without rebuilding the ledger or losing row identity. */
export function patchTransactionRows(rows, record, {onlyIfUncategorized=false}={}) {
  if (!Array.isArray(rows) || !record?.transaction_id) return rows;
  let found=false;
  const updated=rows.map(row=>{
    if (row.transaction_id !== record.transaction_id) return row;
    const patch={...record};
    if (onlyIfUncategorized && patch.category && row.category && row.category !== "uncategorized") {
      delete patch.category;
      delete patch.category_approval_status;
    }
    found=true;
    return {...row,...patch};
  });
  return found ? updated : rows;
}
export function matchesTransactionFilters(tx,filters={}) {
  if (!tx?.transaction_id) return false;
  const date=String(tx.date || "").slice(0,10);
  if (filters.date_from && date < filters.date_from) return false;
  if (filters.date_to && date > filters.date_to) return false;
  if (filters.category && tx.category !== filters.category) return false;
  if (filters.account_id && tx.account_id !== filters.account_id) return false;
  if (filters.source && tx.source !== filters.source) return false;
  if (filters.approval_status && filters.approval_status !== tx.approval_status && filters.approval_status !== tx.category_approval_status) return false;
  const amount=Number(tx.amount || 0);
  const kind=(tx.is_transfer || tx.tx_type==="transfer") ? "transfer" : amount>0 ? "income" : "expense";
  if (filters.tx_type && filters.tx_type !== kind) return false;
  if (filters.amount_min && Math.abs(amount)<Number(filters.amount_min)) return false;
  if (filters.amount_max && Math.abs(amount)>Number(filters.amount_max)) return false;
  const merchant=String(tx.merchant_name || tx.merchant || "");
  if (filters.merchant && !merchant.toLowerCase().includes(filters.merchant.toLowerCase())) return false;
  const haystack=[tx.description,merchant,tx.category].filter(Boolean).join(" ").toLowerCase();
  if (filters.search && !haystack.includes(filters.search.trim().toLowerCase())) return false;
  return true;
}
export function insertTransactionRow(rows,record,filters={},limit=50) {
  if (!Array.isArray(rows) || !matchesTransactionFilters(record,filters)) return rows;
  if (rows.some(row=>row.transaction_id===record.transaction_id)) return patchTransactionRows(rows,record);
  const next=[...rows,record];
  if (filters.sort==="date" || !filters.sort) {
    const desc=filters.order!=="asc";
    next.sort((a,b)=>desc?String(b.date||"").localeCompare(String(a.date||"")):String(a.date||"").localeCompare(String(b.date||"")));
  } else if (filters.sort==="amount") {
    const direction=filters.order==="asc"?1:-1;
    next.sort((a,b)=>direction*(Number(a.amount||0)-Number(b.amount||0)));
  }
  return next.slice(0,limit);
}
