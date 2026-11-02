import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

/** Global, route-independent action state. Only meaningful navigation changes the URL. */
const ActionContext = createContext(null);

export function ActionProvider({ children }) {
  const [active, setActive] = useState(null);
  const openAction = useCallback((type, payload = {}) => {
    setActive({ type, payload, key: Date.now() });
  }, []);
  const closeAction = useCallback(() => setActive(null), []);
  const changed = useCallback((entity) => {
    window.dispatchEvent(new CustomEvent("penni:data-changed", { detail: { entity } }));
  }, []);
  const value = useMemo(() => ({ active, openAction, closeAction, changed }), [active, openAction, closeAction, changed]);
  return <ActionContext.Provider value={value}>{children}</ActionContext.Provider>;
}

export function useActions() {
  const actions = useContext(ActionContext);
  if (!actions) throw new Error("useActions must be used within ActionProvider");
  return actions;
}
