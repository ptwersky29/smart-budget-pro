import React, { useState, useCallback, useRef, useEffect } from "react";
import { Check, ChevronDown, Plus, Loader2, Search } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "./ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import {
  Command,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "./ui/command";

function groupBySection(cats) {
  const groups = {};
  for (const c of cats) {
    const section = c.section || "Other";
    if (!groups[section]) groups[section] = [];
    groups[section].push(c);
  }
  return groups;
}

export default function CategoryCombobox({
  value,
  onChange,
  categories = [],
  placeholder = "Select category…",
  className,
  allowClear,
  onCategoryCreated,
}) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);

  const grouped = groupBySection(categories);

  const selected = categories.find((c) => c.name === value);

  const handleSelect = useCallback(
    (val) => {
      if (val === "__add__") {
        setOpen(false);
        setAddOpen(true);
        return;
      }
      if (val === "__clear__") {
        onChange("");
        setOpen(false);
        return;
      }
      onChange(val);
      setOpen(false);
    },
    [onChange]
  );

  const handleAddCategory = useCallback(async () => {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name) return;
    setAdding(true);
    try {
      await api.post("/categories", { name });
      onChange(name);
      setAddOpen(false);
      setNewName("");
      if (onCategoryCreated) onCategoryCreated();
    } catch (err) {
      // toast handled by caller or left silent
    } finally {
      setAdding(false);
    }
  }, [newName, onChange]);

  useEffect(() => {
    if (addOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [addOpen]);

  const hasValue = Boolean(value);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "flex h-12 w-full items-center justify-between rounded-xl bg-secondary/50 border border-transparent px-4 text-[15px] transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
              !value && "text-muted-foreground",
              className
            )}
          >
            <span className="break-all line-clamp-2">
              {value
                ? selected
                  ? selected.name
                  : value
                : placeholder}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories…"
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-[15px] outline-none placeholder:text-muted-foreground"
              />
            </div>
            <CommandList>
              <CommandEmpty>
                {search ? "No categories found" : "No categories"}
              </CommandEmpty>
              {Object.entries(grouped).map(([section, cats]) => {
                const filtered = cats.filter((c) =>
                  !search || c.name.toLowerCase().includes(search.toLowerCase())
                );
                if (filtered.length === 0) return null;
                return (
                  <CommandGroup key={section} heading={section}>
                    {filtered.map((c) => (
                      <CommandItem
                        key={c.category_id ?? c.name}
                        value={c.name}
                        onSelect={handleSelect}
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                            value === c.name
                              ? "border-emerald bg-emerald text-white"
                              : "border-border"
                          )}
                        >
                          {value === c.name && (
                            <Check className="h-3 w-3" />
                          )}
                        </div>
                        <span className="break-all">{c.name}</span>
                        {c.source === "Custom" && (
                          <span className="ml-auto text-[10px] px-1 py-0.5 rounded-full bg-topaz/10 text-topaz shrink-0">
                            Custom
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
              <CommandSeparator />
              <CommandItem value="__add__" onSelect={handleSelect}>
                <Plus className="mr-2 h-4 w-4" />
                Add custom category
              </CommandItem>
              {allowClear && hasValue && (
                <CommandItem value="__clear__" onSelect={handleSelect}>
                  Clear selection
                </CommandItem>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add custom category</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              ref={inputRef}
              placeholder="Category name (e.g. pet_care)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCategory();
                if (e.key === "Escape") { setAddOpen(false); setNewName(""); }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outlinePill" size="pillSm" onClick={() => { setAddOpen(false); setNewName(""); }}>
              Cancel
            </Button>
            <Button variant="primary" size="pillSm" onClick={handleAddCategory} disabled={!newName.trim() || adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
