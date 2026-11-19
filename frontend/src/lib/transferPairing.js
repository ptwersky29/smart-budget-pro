/** Pairing invariants mirror backend/finance_engine.py transfer-pairs. */
export function isPotentialOppositeSide(first, second) {
  if (!first || !second || !first.transaction_id || !second.transaction_id ||
      first.transaction_id === second.transaction_id ||
      first.transfer_pair_id || second.transfer_pair_id) return false;
  const a = Number(first.amount), b = Number(second.amount);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0 || a * b >= 0) return false;
  // Calculate in minor units exactly as the backend does.
  return Math.round(Math.abs(a) * 100) === Math.round(Math.abs(b) * 100);
}
export function canPairTransactions(first, second) {
  return isPotentialOppositeSide(first, second) &&
    Boolean(first.account_id && second.account_id) &&
    first.account_id !== second.account_id &&
    (first.currency || "GBP") === (second.currency || "GBP");
}
