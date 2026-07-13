import React, { useState, useRef, useCallback } from "react";
import { X, Upload, Wallet, Lock } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { Button } from "./ui/button";
import { toast } from "sonner";

const ACCOUNT_TYPES = [
  { value: "current", label: "Current Account", icon: "💰" },
  { value: "savings", label: "Savings", icon: "🔒" },
  { value: "cash", label: "Cash", icon: "💵" },
  { value: "credit", label: "Credit Card", icon: "💳" },
];

const PRESET_COLORS = [
  "#059669", "#2563eb", "#7c3aed", "#db2777", "#dc2626",
  "#ea580c", "#ca8a04", "#0891b2", "#4f46e5", "#6b7280",
];

function getInitials(name) {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function CirclePreview({ image, color, name, size = "lg" }) {
  const sizes = { sm: "h-10 w-10 text-xs", md: "h-14 w-14 text-sm", lg: "h-20 w-20 text-xl" };
  const imgSizes = { sm: "h-8 w-8", md: "h-12 w-12", lg: "h-16 w-16" };
  const initials = getInitials(name || "?");
  const [imgError, setImgError] = useState(false);

  if (image && !imgError) {
    return (
      <div className={`${sizes[size]} rounded-full overflow-hidden ring-2 ring-white dark:ring-gray-800 shadow-md mx-auto`}>
        <img src={image} alt={name} className={`${imgSizes[size]} object-cover`}
          onError={() => setImgError(true)} />
      </div>
    );
  }

  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center font-bold text-white shadow-md mx-auto`}
      style={{ background: color || "#059669" }}>
      {initials || "?"}
    </div>
  );
}

function cropToCircle(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
      canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          URL.revokeObjectURL(url);
          resolve(reader.result);
        };
        reader.readAsDataURL(blob);
      }, "image/png", 0.9);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export default function AccountFormModal({ open, onClose, onCreated, editAccount }) {
  const [name, setName] = useState(editAccount?.name || "");
  const [accountType, setAccountType] = useState(editAccount?.type || "current");
  const [balance, setBalance] = useState(editAccount?.balance ?? "");
  const [color, setColor] = useState(editAccount?.color || "#059669");
  const [imageDataUri, setImageDataUri] = useState(editAccount?.image || null);
  const [saving, setSaving] = useState(false);
  const [cropping, setCropping] = useState(false);
  const fileRef = useRef(null);

  const formKey = editAccount?.account_id || "new";
  if (!open) return null;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    setCropping(true);
    try {
      const dataUri = await cropToCircle(file, 256);
      setImageDataUri(dataUri);
    } catch {
      toast.error("Failed to process image");
    } finally {
      setCropping(false);
    }
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
        type: accountType,
        balance: balance === "" ? null : parseFloat(balance),
        color,
      };
      if (imageDataUri) payload.image = imageDataUri;

      if (editAccount?.account_id) {
        await api.put(`/accounts/${editAccount.account_id}`, payload);
        toast.success(`"${name.trim()}" updated`);
      } else {
        const { data } = await api.post("/accounts", payload);
        toast.success(`"${data.name}" created`);
      }
      setName(""); setAccountType("current"); setBalance(""); setColor("#059669"); setImageDataUri(null);
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to save account");
    } finally {
      setSaving(false);
    }
  };

  const isSavings = accountType === "savings";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-form-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-xl p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`grid h-8 w-8 place-items-center rounded-xl ${isSavings ? "bg-violet/10 text-violet" : "bg-emerald/10 text-emerald"}`}>
              {isSavings ? <Lock className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
            </span>
            <h2 id="account-form-title" className="text-lg font-semibold">{editAccount ? "Edit Account" : "New Account"}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full grid place-items-center hover:bg-secondary/60 transition-colors" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form key={formKey} onSubmit={handleSubmit} className="space-y-4">
          {/* Circle preview */}
          <CirclePreview image={imageDataUri} color={color} name={name} size="lg" />

          {/* Name */}
          <div>
            <label className="label-overline text-muted-foreground mb-1.5 block">Account Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HSBC Main Account" required
              className="w-full h-10 px-3 rounded-xl bg-secondary/30 border border-border focus:border-emerald/50 focus:outline-none text-sm" />
          </div>

          {/* Type */}
          <div>
            <label className="label-overline text-muted-foreground mb-1.5 block">Account Type</label>
            <div className="grid grid-cols-2 gap-2">
              {ACCOUNT_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => setAccountType(t.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all ${
                    accountType === t.value
                      ? (t.value === "savings" ? "border-violet/50 bg-violet/5 text-violet ring-1 ring-violet/20" : "border-emerald/50 bg-emerald/5 text-emerald ring-1 ring-emerald/20")
                      : "border-border/60 bg-secondary/20 text-muted-foreground hover:border-border hover:text-foreground"
                  }`}>
                  <span>{t.icon}</span>
                  <span className="text-xs font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {isSavings && (
            <div className="rounded-xl bg-violet/5 border border-violet/20 p-3 flex items-start gap-2.5">
              <Lock className="h-4 w-4 text-violet shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Savings accounts are visually separated and marked as non-spendable. Transactions will show as savings.
              </p>
            </div>
          )}

          {/* Balance */}
          <div>
            <label className="label-overline text-muted-foreground mb-1.5 block">
              {isSavings ? "Current Savings (£)" : "Starting Balance (£)"}
            </label>
            <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00" step="0.01"
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
            <label className="label-overline text-muted-foreground mb-1.5 block">Account Logo (optional)</label>
            {imageDataUri ? (
              <div className="flex items-center gap-3 rounded-xl bg-secondary/20 border border-border/50 p-3">
                <CirclePreview image={imageDataUri} color={color} name={name} size="sm" />
                <span className="text-xs text-muted-foreground flex-1 truncate">Custom logo</span>
                <button type="button" onClick={clearImage} className="text-xs text-ruby hover:underline shrink-0">Remove</button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={cropping}
                className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-secondary/20 border border-dashed border-border/60 hover:border-emerald/50 text-xs text-muted-foreground hover:text-emerald transition-colors disabled:opacity-50">
                {cropping ? <><Loader2 className="h-4 w-4 animate-spin" /> Cropping…</> : <><Upload className="h-4 w-4" /> Upload Image</>}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={handleFile} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <Button type="button" variant="outlinePill" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving || cropping} className="flex-1">
              {saving ? "Saving…" : editAccount ? "Save Changes" : "Create Account"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
