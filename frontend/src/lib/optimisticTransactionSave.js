/**
 * Immediate, reversible transaction mutation. Display pending data first;
 * never report success until the server returns a canonical transaction.
 * A failed create is not auto-retried, because the server may already have
 * committed the original POST before a connection timeout.
 */
export function runOptimisticTransactionSave({
  kind, optimistic, original, persist, emit, onSaved, onFailure,
}) {
  if (!["created", "updated"].includes(kind)) throw new Error("Invalid save type");
  if (!optimistic?.transaction_id) throw new Error("Transaction ID required");
  const clientId = optimistic.transaction_id;
  emit({ operation:kind, phase:"optimistic", record:{...optimistic,_saveStatus:"saving"} });
  return Promise.resolve()
    .then(persist)
    .then(record => {
      const saved = record?.transaction || record;
      if (!saved?.transaction_id) {
        throw new Error("Server did not confirm a saved transaction");
      }
      emit({
        operation:kind === "created" ? "created-confirmed" : "updated",
        phase:"confirmed", clientId,
        record:{...saved,_saveStatus:null},
      });
      onSaved?.(saved);
      return saved;
    })
    .catch(error => {
      emit({
        operation:kind === "created" ? "created-rolled-back" : "updated",
        phase:"rolled-back", clientId,
        record:original ? {...original,_saveStatus:null} : null,
      });
      onFailure?.(error);
      return null;
    });
}
