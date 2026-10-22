import React, { useEffect, useRef, useState } from "react";
import { Bot, Loader2, RotateCcw, Send, ShieldCheck, ShieldOff, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useAssistant } from "../../contexts/AssistantContext";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../ui/sheet";
import { Button } from "../ui/button";

const SUGGESTIONS = [
  "Analyse my spending this month",
  "Help me create a budget",
  "Find unusual transactions",
  "Show this month's summary",
];

function Message({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${isUser ? "bg-secondary text-muted-foreground" : "gradient-emerald text-white"}`}>
        {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
      </span>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
          isUser
            ? "rounded-tr-md bg-secondary/70 text-foreground"
            : "rounded-tl-md border border-border/60 bg-card text-foreground shadow-sm"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

export default function AssistantPanel() {
  const { user } = useAuth();
  const {
    open,
    closeAssistant,
    prefill,
    setPrefill,
    sessionId,
    rememberSession,
    contextConsent,
    decideContext,
  } = useAssistant();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const endRef = useRef(null);
  const loadedSessionRef = useRef(null);

  useEffect(() => {
    if (open && prefill) {
      setInput(prefill);
      setPrefill("");
    }
  }, [open, prefill, setPrefill]);

  useEffect(() => {
    if (!open) return;
    if (!sessionId) {
      setMessages([]);
      setHistoryLoaded(true);
      return;
    }
    if (loadedSessionRef.current === sessionId) return;
    let cancelled = false;
    setHistoryLoaded(false);
    api
      .get(`/ai/history/${sessionId}`)
      .then(({ data }) => {
        if (cancelled) return;
        setMessages(data.messages || []);
        loadedSessionRef.current = sessionId;
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, busy, open]);

  const send = async (text) => {
    const message = String(text || "").trim();
    if (!message || busy) return;
    setError("");
    setInput("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setBusy(true);
    try {
      const { data } = await api.post("/ai/chat", {
        message,
        session_id: sessionId || undefined,
        include_financial_context: contextConsent === "enabled",
      });
      setMessages((current) => [...current, { role: "assistant", content: data.response }]);
      if (data.session_id && data.session_id !== sessionId) {
        loadedSessionRef.current = data.session_id;
        rememberSession(data.session_id);
      }
    } catch (requestError) {
      const detail = formatApiError(requestError);
      setError(detail || "Penni AI could not answer right now.");
      toast.error(detail || "Could not reach Penni AI");
    } finally {
      setBusy(false);
    }
  };

  const chooseSuggestion = (suggestion) => {
    if (contextConsent === "unknown") {
      setInput(suggestion);
      return;
    }
    send(suggestion);
  };

  const newChat = () => {
    rememberSession(null);
    loadedSessionRef.current = null;
    setMessages([]);
    setError("");
    setInput("");
    setHistoryLoaded(true);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? null : closeAssistant())}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-[430px]">
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4 pr-14">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald text-white shadow-md shadow-emerald/20">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate text-sm font-semibold">Penni AI</SheetTitle>
              <SheetDescription className="mt-0.5 text-[11px]">
                Your private finance assistant
              </SheetDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={newChat}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        {contextConsent === "unknown" ? (
          <div className="m-4 rounded-2xl border border-emerald/20 bg-emerald/[0.055] p-4">
            <div className="flex items-center gap-2 text-emerald">
              <ShieldCheck className="h-4 w-4" />
              <p className="text-xs font-semibold">Help Penni answer with your numbers</p>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Penni can share a summary of your accounts, transactions and budgets with your configured AI provider. You can change this at any time.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => decideContext("enabled")}>
                Use my data
              </Button>
              <Button variant="outlinePill" size="sm" onClick={() => decideContext("disabled")}>
                Not now
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => decideContext(contextConsent === "enabled" ? "disabled" : "enabled")}
            className="mx-4 mt-4 flex items-center gap-2 rounded-full border border-border/60 bg-secondary/30 px-3 py-2 text-left text-[10px] text-muted-foreground transition hover:bg-secondary/60"
          >
            {contextConsent === "enabled" ? (
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald" />
            ) : (
              <ShieldOff className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="min-w-0 flex-1">
              {contextConsent === "enabled"
                ? "Financial context is on. Tap to turn it off."
                : "Financial context is off. Tap to let Penni use your data."}
            </span>
          </button>
        )}

        <div className="subtle-scroll flex-1 overflow-y-auto px-4 py-4">
          {!historyLoaded ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-5">
              <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald/10 text-emerald">
                  <Bot className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-base font-semibold tracking-[-0.025em]">
                  Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Ask me about your spending, budgets, transactions or how Penni works. I use your real account data only when you enable it.
                </p>
              </div>
              <div className="space-y-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => chooseSuggestion(suggestion)}
                    className="flex w-full items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3.5 py-2.5 text-left text-xs transition hover:border-emerald/25 hover:bg-emerald/[0.04]"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald" />
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <Message key={`${message.role}-${index}`} message={message} />
              ))}
              {busy ? (
                <div className="flex gap-2.5">
                  <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full gradient-emerald text-white">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-border/60 bg-card px-3.5 py-3">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald [animation-delay:240ms]" />
                  </div>
                </div>
              ) : null}
              {error ? (
                <div className="rounded-xl border border-ruby/20 bg-ruby/[0.05] px-3.5 py-3 text-xs text-ruby">
                  <p>{error}</p>
                  <button type="button" onClick={() => send(messages.filter((m) => m.role === "user").slice(-1)[0]?.content)} className="mt-2 font-semibold underline underline-offset-2">
                    Try again
                  </button>
                </div>
              ) : null}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-border/60 bg-card/80 p-3.5">
          <div className="flex items-end gap-2 rounded-2xl border border-border/70 bg-background px-3 py-2 focus-within:border-emerald/40 focus-within:ring-2 focus-within:ring-emerald/10">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask anything..."
              rows={1}
              className="max-h-28 min-h-[32px] flex-1 resize-none bg-transparent py-1 text-[13px] outline-none placeholder:text-muted-foreground"
              aria-label="Message Penni AI"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={busy || !input.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald text-white transition hover:bg-emerald/90 disabled:opacity-40"
              aria-label="Send message"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            Penni AI can make mistakes. Verify important financial information.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
