// Reference Penny account-card gradients. Stable per account across pages.
// Deterministic hashing keeps the same tone when a list order changes.
export const ACCOUNT_GRADIENTS = Object.freeze([
  "linear-gradient(135deg,#1e1b4b 0%,#312e81 45%,#5b5cf0 115%)",
  "linear-gradient(135deg,#052e2b 0%,#0f766e 55%,#34d399 125%)",
  "linear-gradient(135deg,#6b1d0e 0%,#d1344f 58%,#fb923c 125%)",
  "linear-gradient(135deg,#14341d 0%,#3f6212 60%,#a3e635 140%)",
  "linear-gradient(135deg,#0b0f19 0%,#26272d 55%,#6b6f7a 130%)",
  "linear-gradient(135deg,#082f49 0%,#0369a1 58%,#38bdf8 125%)",
  "linear-gradient(135deg,#6b0f35 0%,#be185d 58%,#f9a8d4 130%)",
]);

export function accountGradient(account = {}) {
  const identity = String(account.account_id || account.id || account.name || "");
  let hash = 0;
  for (const char of identity) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return ACCOUNT_GRADIENTS[hash % ACCOUNT_GRADIENTS.length];
}
