import React, { useState, useRef, useEffect } from "react";
import { Plus, Loader2, Sparkles, Check, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { api } from "../lib/api";
import { toast } from "sonner";

export default function QuickAddWidget() {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassification] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  const handleClassify = async () => {
    if (!desc.trim() || !amount) return;
    setClassifying(true);
    setClassification(null);
    try {
      const { data } = await api.post("/budget-system/classify", { description: desc.trim(), amount: parseFloat(amount) });
      setClassification(data);
    } catch { toast.error("Classification failed"); }
    finally { setClassifying(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !classifying && desc.trim() && amount) {
      if (classification) {
        handleApprove();
      } else {
        handleClassify();
      }
    }
    if (e.key === "Escape") handleClose();
  };

  const handleApprove = async () => {
    if (!classification) return;
    try {
      const signed = -Math.abs(parseFloat(amount));
      await api.post("/budget-system/approve", {
        description: desc.trim(),
        amount: signed,
        budget_type: classification.budget_type || "day_to_day",
        occasion: classification.occasion || "Monthly Living",
        category: classification.category || "uncategorized",
        suggestion_id: classification.suggestion_id,
      });
      toast.success("Transaction added");
      handleClose();
    } catch { toast.error("Could not add transaction"); }
  };

  const handleClose = () => {
    setOpen(false);
    setDesc("");
    setAmount("");
    setClassification(null);
  };

  return (
    <>
      {/* FAB */}
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full gradient-emerald text-white shadow-lg shadow-emerald/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center">
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Quick form */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[calc(100vw-2rem)] sm:w-96 animate-[fadeUp_0.2s_ease-out]" ref={ref}>
          <div className="rounded-2xl border-2 border-emerald/30 bg-card p-4 shadow-xl shadow-emerald/10">
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
              <input placeholder="Description (e.g. Tesco £84)" value={desc}
                onChange={e => { setDesc(e.target.value); setClassification(null); }}
                onKeyDown={handleKeyDown}
                className="w-full h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none text-sm" />
              <input placeholder="Amount" type="number" value={amount}
                onChange={e => { setAmount(e.target.value); setClassification(null); }}
                onKeyDown={handleKeyDown}
                className="w-full h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none text-sm" />

              <Button variant="primary" size="pill" onClick={classification ? handleApprove : handleClassify}
                disabled={classifying || !desc.trim() || !amount}
                className="w-full">
                {classifying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {classifying ? "Classifying…" : classification ? "Approve & Add" : "Classify"}
              </Button>
            </div>

            {classification && (
              <div className="mt-3 rounded-xl bg-emerald/5 border border-emerald/20 p-3 text-xs space-y-1.5 animate-[fadeUp_0.2s_ease-out]">
                <div className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-emerald" />
                  <span className="font-medium text-emerald">
                    {Math.round((classification.confidence || 0) * 100)}% confident
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <span className="text-muted-foreground">Budget type</span>
                  <span className="font-medium capitalize">{classification.budget_type?.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">Category</span>
                  <span className="font-medium capitalize">{classification.category}</span>
                  {classification.merchant && (
                    <><span className="text-muted-foreground">Merchant</span><span className="font-medium">{classification.merchant}</span></>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
