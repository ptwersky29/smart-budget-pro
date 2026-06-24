import React, { useCallback, useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import CategoryBadge from "./CategoryBadge";
import CategoryEditorDialog from "./CategoryEditorDialog";
import { useCategories } from "../contexts/CategoriesContext";
import { formatApiError } from "../lib/api";

function groupBySection(categories) {
  const groups = {};
  categories.forEach((category) => {
    const section = category.section || "🧩 Ungrouped";
    if (!groups[section]) groups[section] = [];
    groups[section].push(category);
  });
  return groups;
}

export default function CategoryCombobox({
  value,
  onChange,
  categories: categoriesProp,
  placeholder = "Select category…",
  className,
  allowClear = false,
  onCategoryCreated,
}) {
  const {
    categories: sharedCategories,
    createCategory,
    resolveCategory,
  } = useCategories();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const categories = categoriesProp?.length ? categoriesProp : sharedCategories;
  const selected = value ? resolveCategory(value) : null;

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = !query
      ? categories
      : categories.filter((category) => {
          const haystack = [
            category.name,
            category.label,
            category.display_name,
            category.section,
            category.description,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        });

    const groups = groupBySection(filtered);
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [categories, search]);

  const handleSelect = useCallback(
    (nextValue) => {
      if (nextValue === "__add__") {
        setOpen(false);
        setAddOpen(true);
        return;
      }
      if (nextValue === "__clear__") {
        onChange?.("");
        setOpen(false);
        return;
      }
      onChange?.(nextValue);
      setOpen(false);
    },
    [onChange],
  );

  const handleCreate = useCallback(
    async (payload) => {
      setAdding(true);
      try {
        const created = await createCategory(payload);
        onChange?.(created.name);
        onCategoryCreated?.(created);
        setAddOpen(false);
        toast.success(`Category “${created.label || created.name}” created`);
      } catch (error) {
        toast.error(
          formatApiError(error?.response?.data?.detail) ||
            "Could not create category",
        );
      } finally {
        setAdding(false);
      }
    },
    [createCategory, onCategoryCreated, onChange],
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-transparent bg-secondary/50 px-4 text-left text-[15px] transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50",
              !selected && "text-muted-foreground",
              className,
            )}
          >
            <div className="min-w-0 flex-1">
              {selected ? (
                <CategoryBadge
                  category={selected}
                  size="md"
                  className="max-w-full"
                  truncate
                />
              ) : (
                <span>{placeholder}</span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search categories…"
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-[15px] outline-none placeholder:text-muted-foreground"
              />
            </div>
            <CommandList>
              <CommandEmpty>
                {search ? "No categories found" : "No categories yet"}
              </CommandEmpty>
              {filteredGroups.map(([section, items]) => (
                <CommandGroup key={section} heading={section}>
                  {items.map((category) => (
                    <CommandItem
                      key={category.category_id || category.name}
                      value={category.name}
                      onSelect={handleSelect}
                      className="gap-2 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <CategoryBadge
                          category={category}
                          size="md"
                          className="max-w-full"
                          truncate
                        />
                      </div>
                      {value === category.name && (
                        <Check className="h-4 w-4 shrink-0 text-emerald" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              <CommandSeparator />
              <CommandItem
                value="__add__"
                onSelect={handleSelect}
                className="gap-2 py-2.5"
              >
                <Plus className="h-4 w-4" />
                Create category
              </CommandItem>
              {allowClear && value && (
                <CommandItem value="__clear__" onSelect={handleSelect}>
                  Clear selection
                </CommandItem>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CategoryEditorDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSave={handleCreate}
        saving={adding}
        title="Create category"
        submitLabel={adding ? "Creating…" : "Create category"}
        initialCategory={search ? { label: search } : null}
      />
    </>
  );
}
