import React, { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Shuffle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { PageHeader } from "../components/ui/layout";
import CategoryBadge from "../components/CategoryBadge";
import CategoryEditorDialog from "../components/CategoryEditorDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { useCategories } from "../contexts/CategoriesContext";
import { formatApiError } from "../lib/api";

function groupCategories(categories) {
  const groups = {};
  categories.forEach((category) => {
    const section = category.section || "🧩 Ungrouped";
    if (!groups[section]) groups[section] = [];
    groups[section].push(category);
  });
  return Object.entries(groups)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([section, items]) => [
      section,
      [...items].sort((a, b) =>
        (a.label || a.name).localeCompare(b.label || b.name),
      ),
    ]);
}

function UsageChips({ usage }) {
  const items = [
    ["transactions", usage?.transactions || 0],
    ["budgets", usage?.budgets || 0],
    ["recurring", usage?.recurring || 0],
    ["subscriptions", usage?.subscriptions || 0],
    ["rules", usage?.rules || 0],
  ].filter(([, count]) => count > 0);

  if (!items.length) {
    return <span className="text-xs text-muted-foreground">Unused</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([label, count]) => (
        <span
          key={label}
          className="rounded-full bg-secondary/70 px-2 py-1 text-[11px] text-muted-foreground"
        >
          {count} {label}
        </span>
      ))}
    </div>
  );
}

export default function CategoryManager() {
  const {
    categories,
    loading,
    createCategory,
    updateCategory,
    deleteCategory,
    reassignDeleteCategory,
    getReplacementOptions,
  } = useCategories();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [replacementCategory, setReplacementCategory] = useState("");

  const grouped = useMemo(
    () =>
      groupCategories(categories.filter((category) => !category.is_archived)),
    [categories],
  );
  const stats = useMemo(
    () => ({
      total: categories.length,
      system: categories.filter((category) => category.source === "System")
        .length,
      custom: categories.filter((category) => category.source === "Custom")
        .length,
      linked: categories.filter((category) => (category.usage?.total || 0) > 0)
        .length,
    }),
    [categories],
  );

  const replacementOptions = useMemo(() => {
    if (!deleteTarget) return [];
    return getReplacementOptions(deleteTarget.name);
  }, [deleteTarget, getReplacementOptions]);

  const openCreate = () => {
    setEditingCategory(null);
    setEditorOpen(true);
  };

  const openEdit = (category) => {
    setEditingCategory(category);
    setEditorOpen(true);
  };

  const handleSave = async (payload) => {
    setSaving(true);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.category_id, payload);
        toast.success(`Updated ${payload.label}`);
      } else {
        await createCategory(payload);
        toast.success(`Created ${payload.label}`);
      }
      setEditorOpen(false);
      setEditingCategory(null);
    } catch (error) {
      toast.error(
        formatApiError(error?.response?.data?.detail) ||
          "Could not save category",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      if ((deleteTarget.usage?.total || 0) > 0) {
        if (!replacementCategory) {
          toast.error("Choose a replacement category first");
          return;
        }
        await reassignDeleteCategory(deleteTarget.category_id, {
          replacement_category_id: replacementCategory,
        });
        toast.success(
          `Deleted ${deleteTarget.label} and reassigned linked items`,
        );
      } else {
        await deleteCategory(deleteTarget.category_id);
        toast.success(`Deleted ${deleteTarget.label}`);
      }
      setDeleteTarget(null);
      setReplacementCategory("");
    } catch (error) {
      toast.error(
        formatApiError(error?.response?.data?.detail) ||
          "Could not delete category",
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  if (loading && categories.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Categories"
        description="Manage the emoji, colour, label, and lifecycle of every category in one place. Changes update transactions, budgets, and summaries across the app."
        actions={
          <Button variant="primary" size="pill" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add category
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total categories", stats.total],
          ["System", stats.system],
          ["Custom", stats.custom],
          ["Linked in app", stats.linked],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card/90 p-4"
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-5">
        {grouped.map(([section, items]) => (
          <section key={section} className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-secondary/15 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">{section}</h2>
                <p className="text-xs text-muted-foreground">
                  {items.length} categories
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {items.map((category) => (
                <article
                  key={category.category_id || category.name}
                  className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <CategoryBadge category={category} size="lg" />
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${category.source === "System" ? "bg-secondary/70 text-muted-foreground" : "bg-emerald/10 text-emerald"}`}
                        >
                          {category.source}
                        </span>
                      </div>

                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="font-mono text-xs text-muted-foreground/80">
                          {category.name}
                        </div>
                        {category.description ? (
                          <p>{category.description}</p>
                        ) : null}
                      </div>

                      <UsageChips usage={category.usage} />
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(category)}
                        className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        aria-label={`Edit ${category.label}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {category.can_delete && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget(category);
                            setReplacementCategory("");
                          }}
                          className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-ruby/10 hover:text-ruby"
                          aria-label={`Delete ${category.label}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <CategoryEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingCategory(null);
        }}
        initialCategory={editingCategory}
        onSave={handleSave}
        saving={saving}
        title={
          editingCategory ? `Edit ${editingCategory.label}` : "Create category"
        }
        submitLabel={
          saving
            ? "Saving…"
            : editingCategory
              ? "Save category"
              : "Create category"
        }
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setReplacementCategory("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete category</DialogTitle>
          </DialogHeader>

          {deleteTarget && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-secondary/20 p-4">
                <CategoryBadge category={deleteTarget} size="lg" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {(deleteTarget.usage?.total || 0) > 0
                    ? "This category is linked to existing data. Choose where those linked items should move before deleting it."
                    : "This category is not linked anywhere, so it can be safely removed."}
                </p>
              </div>

              {(deleteTarget.usage?.total || 0) > 0 && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Shuffle className="h-4 w-4 text-emerald" />
                    Reassign linked items to
                  </label>
                  <select
                    value={replacementCategory}
                    onChange={(event) =>
                      setReplacementCategory(event.target.value)
                    }
                    className="flex h-11 w-full rounded-2xl border border-border bg-secondary/40 px-4 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="">Choose a replacement category</option>
                    {replacementOptions.map((category) => (
                      <option
                        key={category.category_id}
                        value={category.category_id}
                      >
                        {category.emoji || "🏷️"} {category.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outlinePill"
              size="pill"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="pill"
              className="bg-ruby hover:bg-ruby/90"
              onClick={handleDelete}
              disabled={
                deleteBusy ||
                ((deleteTarget?.usage?.total || 0) > 0 && !replacementCategory)
              }
            >
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {(deleteTarget?.usage?.total || 0) > 0
                ? "Reassign and delete"
                : "Delete category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
