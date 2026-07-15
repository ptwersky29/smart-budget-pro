import React, { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Loader2, Sparkles, Check, X, Brain } from "lucide-react";
import { Button } from "./ui/button";
import { api } from "../lib/api";
import { toast } from "sonner";

export default function QuickAddWidget() {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassification] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const ref = useRef(null);

  const loadAccounts = useCallback(async () => {
    try {
      const { data } = await api.get("/accounts");
      setAccounts(data.accounts || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (open) { ref.current?.focus(); loadAccounts(); } }, [open, loadAccounts]);

  const suggestions = classification?.suggestions || [];
  const top = suggestions[0];
  const selected = suggestions[selectedIdx];

  const handleClassify = async () => {
    if (!desc.trim() || !amount) return;
    setClassifying(true);
    setClassification(null);
    setSelectedIdx(0);
    try {
      const { data } = await api.post("/budget-system/classify", { description: desc.trim(), amount: parseFloat(amount) });
      setClassification(data);
    } catch { toast.error("Classification failed"); }
    finally { setClassifying(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !classifying && desc.trim() && amount && accountId) {
      if (classification) handleApprove();
      else handleClassify();
    }
    if (e.key === "Escape") handleClose();
  };

  const handleApprove = async (index) => {
    const s = index !== undefined ? suggestions[index] : selected;
    if (!s || !accountId) { toast.error("Select an account first"); return; }
    try {
      const parsed = parseFloat(amount);
      if (isNaN(parsed)) { toast.error("Invalid amount"); return; }
      const signed = s.is_income ? Math.abs(parsed) : -Math.abs(parsed);
      await api.post("/budget-system/approve", {
        description: desc.trim(),
        amount: signed,
        budget_type: s.budget_type || "day_to_day",
        occasion: s.occasion || "Monthly Living",
        category: s.category || "uncategorized",
        merchant: s.merchant || "",
        account_id: accountId,
        suggestion_id: classification.suggestion_id,
        suggestion_index: index !== undefined ? index : selectedIdx,
      });
      toast.success("Transaction added");
      handleClose();
    } catch { toast.error("Could not add transaction"); }
  };

  const handleClose = () => {
    setOpen(false);
    setDesc("");
    setAmount("");
    setAccountId("");
    setClassification(null);
    setSelectedIdx(0);
  };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          data-tour="quick-add"
          aria-label="Add transaction quickly"
          className="fixed bottom-20 right-6 z-50 w-14 h-14 rounded-full gradient-emerald text-white shadow-lg shadow-emerald/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center">
          <Plus className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none animate-[fadeIn_0.15s_ease-out]" onClick={handleClose} />
      )}

      {open && (
        <div className="fixed z-50 bottom-0 left-0 right-0 lg:bottom-6 lg:right-6 lg:left-auto lg:w-96 animate-[slideUp_0.25s_ease-out]">
          <div className="rounded-t-2xl lg:rounded-2xl border-2 border-emerald/30 bg-card p-4 shadow-xl shadow-emerald/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald" />
                <span className="text-sm font-medium">Quick transaction</span>
              </div>
              <button onClick={handleClose} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                className="w-full h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none text-sm">
                <option value="">Select account…</option>
                {accounts.map((a) => (
                  <option key={a.account_id} value={a.account_id}>
                    {a.name} {a.type === "savings" ? "(Savings)" : ""}
                  </option>
                ))}
              </select>

              <input placeholder="Description (e.g. Tesco £84)" value={desc}
                onChange={e => { setDesc(e.target.value); setClassification(null); }}
                onKeyDown={handleKeyDown}
                ref={ref}
                className="w-full h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none text-sm" />
              <input placeholder="Amount" type="number" value={amount}
                onChange={e => { setAmount(e.target.value); setClassification(null); }}
                onKeyDown={handleKeyDown}
                className="w-full h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none text-sm" />

              <Button variant="primary" size="pill" onClick={classification ? () => handleApprove() : handleClassify}
                disabled={classifying || !desc.trim() || !amount || !accountId}
                className="w-full">
                {classifying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {classifying ? "Classifying…" : classification ? `Add as ${selected?.category || "uncategorized"}` : "Classify"}
              </Button>
            </div>

            {suggestions.length > 0 && (
              <div className="mt-3 rounded-xl bg-emerald/5 border border-emerald/20 p-3 space-y-2 animate-[fadeUp_0.2s_ease-out]">
                <div className="flex items-center gap-2">
                  <Brain className="h-3.5 w-3.5 text-emerald" />
                  <span className="text-xs font-medium text-emerald">Suggested categories</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald/10 text-emerald ml-auto">
                    Top: {Math.round(top?.confidence * 100)}%
                  </span>
                </div>
                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <div key={i}
                      className={`flex items-center justify-between gap-2 rounded-lg p-2.5 cursor-pointer transition-colors ${
                        selectedIdx === i
                          ? "bg-emerald/10 border border-emerald/30"
                          : "bg-black/5 dark:bg-white/5 hover:bg-secondary/50"
                      }`}
                      onClick={() => setSelectedIdx(i)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {selectedIdx === i
                          ? <Check className="h-3.5 w-3.5 text-emerald shrink-0" />
                          : <span className="w-3.5 h-3.5 shrink-0" />
                        }
                        <span className="text-xs capitalize truncate font-medium">{s.category}</span>
                        {s.merchant && <span className="text-[10px] text-muted-foreground truncate">· {s.merchant}</span>}
                        {s.source === "historical" && <span className="text-[10px] px-1 rounded bg-topaz/10 text-topaz shrink-0">Learned</span>}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{Math.round(s.confidence * 100)}%</span>
                    </div>
                  ))}
                </div>
                {selected?.recurring && (
                  <p className="text-[10px] text-muted-foreground pt-1 border-t border-emerald/10">Marked as recurring</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
