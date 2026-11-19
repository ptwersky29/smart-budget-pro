import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { isPublicDemo } from "../lib/demoSession";
import { runOptimisticTransactionSave } from "../lib/optimisticTransactionSave";
import { formatApiError } from "../lib/api";

/** Global, route-independent action state. Only meaningful navigation changes the URL. */
const ActionContext = createContext(null);

export function ActionProvider({ children }) {
  const [active, setActive] = useState(null);
  const pendingTransactionIds = useRef(new Set());
  const openAction = useCallback((type, payload = {}) => {
    if (type === "transaction-edit" && pendingTransactionIds.current.has(payload?.transaction?.transaction_id)) {
      toast.info("This transaction is still saving. You can edit another transaction.");
      return;
    }
    if (isPublicDemo() && !["transaction-info","account-info","budget-info","accounts-overview","transaction-search","reports"].includes(type)) {
      toast.info("Demo mode is read-only. Sign up to save your own changes.");
      return;
    }
    setActive({ type, payload, key: Date.now() });
  }, []);
  const closeAction = useCallback(() => setActive(null), []);
  // Browsing other pages is safe; closing the tab during an unsaved POST is not.
  React.useEffect(() => {
    const warn = event => {
      if (!pendingTransactionIds.current.size) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const changed = useCallback((entity, details = {}) => {
    window.dispatchEvent(new CustomEvent("penni:data-changed", { detail: { entity, ...details } }));
  }, []);
  const saveTransactionInBackground = useCallback(({ kind, optimistic, original, persist, draft }) => {
    const id = optimistic?.transaction_id;
    if (!id || (kind === "updated" && pendingTransactionIds.current.has(id))) {
      toast.info("This transaction is already saving.");
      return false;
    }
    if (isPublicDemo()) return false;
    pendingTransactionIds.current.add(id);
    void runOptimisticTransactionSave({
      kind, optimistic, original, persist,
      emit: details => changed("transactions", details),
      onSaved: () => toast.success(kind === "created" ? "Transaction saved" : "Transaction updated"),
      onFailure: error => {
        const detail = formatApiError(error) || "Unable to confirm transaction save.";
        // A timed-out POST might have reached the bank ledger. Do not
        // automatically retry creation: that could create a duplicate.
        toast.error(kind === "created"
          ? "Save not confirmed. Check your transactions before trying again."
          : "Save failed. The original transaction was restored.", {
            description: detail,
            action: {
              label: "Review",
              onClick: () => openAction(kind === "created" ? "transaction-new" : "transaction-edit", {
                ...(kind === "created" ? { draft } : { transaction: optimistic }),
              }),
            },
          });
      },
    }).finally(() => pendingTransactionIds.current.delete(id));
    return true;
  }, [changed, openAction]);
  const value = useMemo(
    () => ({ active, openAction, closeAction, changed, saveTransactionInBackground }),
    [active, openAction, closeAction, changed, saveTransactionInBackground],
  );
  return <ActionContext.Provider value={value}>{children}</ActionContext.Provider>;
}

export function useActions() {
  const actions = useContext(ActionContext);
  if (!actions) throw new Error("useActions must be used within ActionProvider");
  return actions;
}
