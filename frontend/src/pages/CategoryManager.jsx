import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Plus, Pencil, Trash2, X, Check, Sparkles, Loader2 } from "lucide-react";

function groupBySection(cats, hierarchy) {
  const grouped = {};
  const used = new Set();
  if (hierarchy && Object.keys(hierarchy).length > 0) {
    for (const [section, names] of Object.entries(hierarchy)) {
      const sectionCats = names.map(n => cats.find(c => c.name === n)).filter(Boolean);
      if (sectionCats.length > 0) {
        grouped[section] = sectionCats;
        sectionCats.forEach(c => used.add(c.name));
      }
    }
  }
  const remaining = cats.filter(c => !used.has(c.name));
  for (const c of remaining) {
    const section = c.section || "Other";
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push(c);
  }
  return grouped;
}

export default function CategoryManager() {
  const [cats, setCats] = useState([]);
  const [hierarchy, setHierarchy] = useState({});
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/categories");
      setCats(data.categories || []);
      setHierarchy(data.hierarchy || {});
    } catch { toast.error("Failed to load categories"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name) return;
    try {
      await api.post("/categories", { name, is_income: false });
      toast.success(`Category "${name}" created`);
      setNewName("");
      setAdding(false);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not create category");
    }
  };

  const handleEdit = async (cat) => {
    const name = editName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name || name === cat.name) { setEditingId(null); return; }
    try {
      await api.patch(`/categories/${cat.category_id}`, { name });
      toast.success("Category renamed");
      setEditingId(null);
      await load();
    } catch { toast.error("Could not update category"); }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete custom category "${cat.name}"?`)) return;
    try {
      await api.delete(`/categories/${cat.category_id}`);
      toast.success(`"${cat.name}" deleted`);
      await load();
    } catch { toast.error("Could not delete category"); }
  };

  const grouped = groupBySection(cats, hierarchy);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Categories" title="Category Manager"
        description={`${cats.filter(c => c.source === "System").length} system categories · ${cats.filter(c => c.source === "Custom").length} custom`}
        actions={
          <Button variant="primary" size="pill" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="h-4 w-4 mr-1" /> Add category
          </Button>
        }
      />

      {/* Add new custom category */}
      {adding && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-secondary/20 animate-[fadeUp_0.15s_ease-out]">
          <Input
            placeholder="Category name (e.g. pet_care)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
            className="flex-1"
            autoFocus
          />
          <Button variant="primary" size="pillSm" onClick={handleAdd} disabled={!newName.trim()}>
            <Check className="h-4 w-4" />
          </Button>
          <Button variant="outlinePill" size="pillSm" onClick={() => { setAdding(false); setNewName(""); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Categories grouped by section */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([section, sectionCats]) => (
          <div key={section}>
            <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">{section}</h3>
            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {sectionCats.map((cat) => (
                <div key={cat.category_id ?? `default-${cat.name}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-medium truncate">{cat.name.replace(/_/g, " ")}</span>
                    {cat.source === "System" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/60 text-muted-foreground shrink-0">System</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-topaz/10 text-topaz shrink-0">Custom</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {cat.source === "Custom" && (
                      <>
                        {editingId === cat.category_id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleEdit(cat); if (e.key === "Escape") setEditingId(null); }}
                              className="h-8 w-36 text-xs"
                              autoFocus
                            />
                            <button onClick={() => handleEdit(cat)} className="p-1.5 rounded-lg hover:bg-emerald/10 text-emerald" aria-label="Save">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground" aria-label="Cancel">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button onClick={() => { setEditingId(cat.category_id); setEditName(cat.name); }} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground" aria-label="Edit category">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleDelete(cat)} className="p-1.5 rounded-lg hover:bg-ruby/10 text-ruby" aria-label="Delete category">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
