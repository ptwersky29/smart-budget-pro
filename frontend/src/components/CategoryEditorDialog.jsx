import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Palette, SmilePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import CategoryBadge from "./CategoryBadge";
import { useCategories } from "../contexts/CategoriesContext";
import {
  CATEGORY_COLOR_PALETTE,
  CATEGORY_EMOJI_OPTIONS,
  hexToRgba,
} from "../lib/categories";

function buildInitialState(category, sectionOptions) {
  return {
    name: category?.label || category?.display_name || category?.name || "",
    emoji: category?.emoji || category?.icon || "🛒",
    color: category?.color || "#22c55e",
    description: category?.description || "",
    section: category?.section || sectionOptions[0] || "🧩 Ungrouped",
    is_income: Boolean(category?.is_income),
  };
}

export default function CategoryEditorDialog({
  open,
  onOpenChange,
  initialCategory = null,
  onSave,
  saving = false,
  title,
  submitLabel,
}) {
  const { sectionOptions } = useCategories();
  const [form, setForm] = useState(() => buildInitialState(initialCategory, sectionOptions));
  const isEditing = Boolean(initialCategory);

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialState(initialCategory, sectionOptions));
  }, [open, initialCategory, sectionOptions]);

  const preview = useMemo(() => ({
    name: initialCategory?.name,
    label: form.name.trim() || "New category",
    display_name: form.name.trim() || "New category",
    emoji: form.emoji,
    icon: form.emoji,
    color: form.color,
    section: form.section,
    source: initialCategory?.source || "Custom",
  }), [form, initialCategory]);

  const canSave = form.name.trim() && form.emoji && form.color;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSave || !onSave) return;
    await onSave({
      name: form.name.trim(),
      label: form.name.trim(),
      emoji: form.emoji,
      color: form.color,
      description: form.description.trim() || null,
      section: form.section,
      is_income: form.is_income,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title || (isEditing ? "Edit category" : "Create category")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-2xl border border-border bg-secondary/20 p-4">
            <p className="label-overline mb-3">Preview</p>
            <div className="flex flex-wrap items-center gap-3">
              <CategoryBadge category={preview} size="lg" />
              <div className="text-sm text-muted-foreground">
                {isEditing && initialCategory?.source === "System"
                  ? "This saves a personal override for the system category and updates all linked transactions instantly."
                  : "The badge styling is used across transactions, budgets, and summaries."}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Name</label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Public Transport"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Description</label>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Optional note to explain what belongs in this category"
                  rows={3}
                  className="flex w-full rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Section</label>
                  <select
                    value={form.section}
                    onChange={(event) => setForm((current) => ({ ...current, section: event.target.value }))}
                    className="flex h-11 w-full rounded-2xl border border-border bg-secondary/40 px-4 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                  >
                    {sectionOptions.map((section) => (
                      <option key={section} value={section}>{section}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/20 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_income}
                    onChange={(event) => setForm((current) => ({ ...current, is_income: event.target.checked }))}
                    className="h-4 w-4 rounded border-border accent-emerald"
                  />
                  <div>
                    <div className="font-medium">Income category</div>
                    <div className="text-xs text-muted-foreground">Use for salary or money in</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-secondary/15 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <SmilePlus className="h-4 w-4 text-emerald" />
                  Emoji
                </div>
                <div className="grid max-h-48 grid-cols-6 gap-2 overflow-y-auto pr-1">
                  {CATEGORY_EMOJI_OPTIONS.map((emoji) => {
                    const active = form.emoji === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, emoji }))}
                        className="grid h-11 w-11 place-items-center rounded-2xl border text-xl transition-all hover:-translate-y-0.5"
                        style={{
                          borderColor: active ? form.color : hexToRgba(form.color, 0.18),
                          backgroundColor: active ? hexToRgba(form.color, 0.16) : "transparent",
                        }}
                        aria-label={`Choose ${emoji}`}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-secondary/15 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Palette className="h-4 w-4 text-topaz" />
                  Colour
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {CATEGORY_COLOR_PALETTE.map((color) => {
                    const active = form.color.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, color }))}
                        className="h-9 rounded-2xl border transition-transform hover:scale-[1.04]"
                        style={{
                          backgroundColor: color,
                          borderColor: active ? "white" : hexToRgba(color, 0.4),
                          boxShadow: active ? `0 0 0 2px ${hexToRgba(color, 0.35)}` : "none",
                        }}
                        aria-label={`Choose ${color}`}
                      />
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">Custom colour</div>
                    <div className="text-xs text-muted-foreground">Pick any accent you want</div>
                  </div>
                  <input
                    type="color"
                    value={form.color}
                    onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                    className="h-10 w-12 cursor-pointer rounded-xl border border-border bg-transparent"
                    aria-label="Pick a custom colour"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outlinePill" size="pill" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="pill" disabled={!canSave || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitLabel || (isEditing ? "Save category" : "Create category")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
