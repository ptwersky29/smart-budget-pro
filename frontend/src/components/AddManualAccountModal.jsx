import React, { useState, useRef } from "react";
import { X, Upload, Wallet } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { Button } from "./ui/button";
import { toast } from "sonner";

const ACCOUNT_TYPES = [
  { value: "current", label: "Current Account" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
];

const PRESET_COLORS = [
  "#059669", "#2563eb", "#7c3aed", "#db2777", "#dc2626",
  "#ea580c", "#ca8a04", "#0891b2", "#4f46e5", "#6b7280",
];

export default function AddManualAccountModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("current");
  const [balance, setBalance] = useState("");
  const [color, setColor] = useState("#059669");
  const [imageDataUri, setImageDataUri] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  if (!open) return null;

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUri(reader.result);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageDataUri(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Account name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        account_type: accountType,
        balance: balance === "" ? null : parseFloat(balance),
        color,
      };
      if (imageDataUri) payload.image = imageDataUri;
      const { data } = await api.post("/accounts/manual", payload);
      toast.success(`"${data.account_name}" added`);
      setName(""); setAccountType("current"); setBalance(""); setColor("#059669"); setImageDataUri(null);
      onCreated?.(data);
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to create account");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-xl p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald/10 text-emerald">
              <Wallet className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-semibold">Add Manual Account</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full grid place-items-center hover:bg-secondary/60 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="label-overline text-muted-foreground mb-1.5 block">Account Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Cash Wallet" required
              className="w-full h-10 px-3 rounded-xl bg-secondary/30 border border-border focus:border-emerald/50 focus:outline-none text-sm" />
          </div>

          {/* Type */}
          <div>
            <label className="label-overline text-muted-foreground mb-1.5 block">Account Type</label>
            <select value={accountType} onChange={(e) => setAccountType(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-secondary/30 border border-border focus:border-emerald/50 focus:outline-none text-sm">
              {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Balance */}
          <div>
            <label className="label-overline text-muted-foreground mb-1.5 block">Starting Balance (£)</label>
            <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00" step="0.01" min="0"
              className="w-full h-10 px-3 rounded-xl bg-secondary/30 border border-border focus:border-emerald/50 focus:outline-none text-sm" />
          </div>

          {/* Color picker */}
          <div>
            <label className="label-overline text-muted-foreground mb-1.5 block">Accent Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }} />
              ))}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="h-7 w-7 rounded-full border border-border/50 cursor-pointer" />
            </div>
          </div>

          {/* Image upload */}
          <div>
            <label className="label-overline text-muted-foreground mb-1.5 block">Custom Logo (optional)</label>
            {imageDataUri ? (
              <div className="flex items-center gap-3 rounded-xl bg-secondary/20 border border-border/50 p-3">
                <img src={imageDataUri} alt="logo preview" className="h-10 w-10 rounded-lg object-contain bg-white dark:bg-secondary/40 border border-border/30" />
                <span className="text-xs text-muted-foreground flex-1 truncate">Custom logo uploaded</span>
                <button type="button" onClick={clearImage} className="text-xs text-ruby hover:underline shrink-0">Remove</button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-secondary/20 border border-dashed border-border/60 hover:border-emerald/50 text-xs text-muted-foreground hover:text-emerald transition-colors">
                <Upload className="h-4 w-4" /> Upload Image
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <Button type="button" variant="outlinePill" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving} className="flex-1">
              {saving ? "Saving…" : "Add Account"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}