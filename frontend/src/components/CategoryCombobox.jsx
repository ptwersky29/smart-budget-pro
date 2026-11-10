import React, { useCallback, useMemo, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import CategoryEditorDialog from "./CategoryEditorDialog";
import { useCategories } from "../contexts/CategoriesContext";
import { formatApiError } from "../lib/api";
import { withCategoryEmoji } from "../lib/categories";

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
  label = "Category",
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

  // Older accounts may contain incomplete custom-category records.
  // A malformed category must never crash the transaction modal on open.
  const incoming = Array.isArray(categoriesProp) && categoriesProp.length ? categoriesProp : sharedCategories;
  const categories = (Array.isArray(incoming) ? incoming : []).filter(
    category => category && typeof category === "object" && typeof category.name === "string"
  ).map(withCategoryEmoji);
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
            aria-label={label}
            aria-expanded={open}
            className={cn(
              "flex min-h-11 w-full items-center justify-between gap-2 rounded-[11px] border border-border bg-card px-3 text-left text-[13px] text-foreground transition-colors hover:border-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50",
              !selected && "text-muted-foreground",
              className,
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2" title={selected?.display_name || selected?.label || selected?.name || placeholder}>
              {selected ? (
                <>
                  <span aria-hidden="true" className="shrink-0 text-base leading-none">{selected.emoji || selected.icon || "🏷️"}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {selected.display_name || selected.label || selected.name}
                  </span>
                </>
              ) : (
                <span className="truncate text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="penni-category-menu flex !w-[min(360px,calc(100vw-24px))] !min-w-[min(320px,calc(100vw-24px))] max-h-[min(75dvh,var(--radix-popover-content-available-height))] flex-col overflow-hidden rounded-xl border border-border bg-popover p-0 shadow-xl"
          align="start"
          side="bottom"
          collisionPadding={12}
          sideOffset={6}
          avoidCollisions
        >
          <Command shouldFilter={false} className="flex min-h-0 flex-col overflow-hidden">
            <CommandInput aria-label="Search categories"
              value={search} onValueChange={setSearch}
              placeholder="Search categories…"
              className="h-11 text-[13px]" />
            <CommandList className="min-h-0 max-h-[min(55dvh,360px)] overflow-y-auto overscroll-contain px-1.5 py-1">
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
                      className="penni-category-menu-item min-h-11 gap-3 rounded-lg px-2.5 py-2 text-[13px] text-foreground data-[selected=true]:bg-secondary/70 data-[selected=true]:text-foreground"
                    >
                      <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary/50 text-base leading-none">
                        {category.emoji || category.icon || "🏷️"}
                      </span>
                      <span className="min-w-0 flex-1 whitespace-normal break-words text-left leading-snug">
                        {category.display_name || category.label || category.name}
                      </span>
                      {value === category.name && (
                        <Check aria-label="Selected" className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              <CommandSeparator />
              <CommandItem
                value="__add__"
                onSelect={handleSelect}
                className="min-h-10 gap-2 rounded-lg px-3 py-2 text-[13px] data-[selected=true]:bg-secondary/70 data-[selected=true]:text-foreground"
              >
                <Plus className="h-4 w-4" />
                Create category
              </CommandItem>
              {allowClear && value && (
                <CommandItem value="__clear__" onSelect={handleSelect}
                  className="min-h-10 rounded-lg px-3 text-[13px] data-[selected=true]:bg-secondary/70 data-[selected=true]:text-foreground">
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
