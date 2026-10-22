import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const AssistantContext = createContext(null);

const SESSION_KEY = "penni.assistant.session";
const CONSENT_KEY = "penni.assistant.contextConsent";

function readConsent() {
  if (typeof window === "undefined") return "unknown";
  const value = window.localStorage.getItem(CONSENT_KEY);
  return value === "enabled" || value === "disabled" ? value : "unknown";
}

export function AssistantProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState("");
  const [sessionId, setSessionId] = useState(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(SESSION_KEY),
  );
  const [contextConsent, setContextConsent] = useState(readConsent);

  const openAssistant = useCallback((options = {}) => {
    setPrefill(typeof options === "string" ? options : options.prompt || "");
    setOpen(true);
  }, []);

  const closeAssistant = useCallback(() => {
    setOpen(false);
    setPrefill("");
  }, []);

  const rememberSession = useCallback((nextSessionId) => {
    setSessionId(nextSessionId || null);
    if (typeof window === "undefined") return;
    if (nextSessionId) window.localStorage.setItem(SESSION_KEY, nextSessionId);
    else window.localStorage.removeItem(SESSION_KEY);
  }, []);

  const decideContext = useCallback((decision) => {
    setContextConsent(decision);
    if (typeof window !== "undefined") window.localStorage.setItem(CONSENT_KEY, decision);
  }, []);

  const value = useMemo(
    () => ({
      open,
      openAssistant,
      closeAssistant,
      prefill,
      setPrefill,
      sessionId,
      rememberSession,
      contextConsent,
      decideContext,
    }),
    [open, openAssistant, closeAssistant, prefill, sessionId, rememberSession, contextConsent, decideContext],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistant must be used inside AssistantProvider");
  return value;
}
