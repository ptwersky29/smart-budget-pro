import React from "react";
import { useCategories } from "../contexts/CategoriesContext";
import { cn } from "../lib/utils";

const SIZE_STYLES = {
  sm: {
    wrap: "gap-1.5 px-2 py-0.5 text-[11px] rounded-full",
    emoji: "text-sm leading-none",
  },
  md: {
    wrap: "gap-2 px-2.5 py-1 text-xs rounded-full",
    emoji: "text-base leading-none",
  },
  lg: {
    wrap: "gap-2.5 px-3 py-1.5 text-sm rounded-2xl",
    emoji: "text-lg leading-none",
  },
};

export default function CategoryBadge({
  category,
  className,
  size = "md",
  muted = false,
  showSource = false,
  truncate = false,
  showIcon = true,
}) {
  const { resolveCategory } = useCategories();
  const meta = typeof category === "string" || !category
    ? resolveCategory(category || "uncategorized")
    : resolveCategory(category.name || category.slug || category.label || "uncategorized", category);

  const styles = SIZE_STYLES[size] || SIZE_STYLES.md;
  const label = meta.display_name || meta.label || meta.name;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center border border-border/70 bg-secondary/50 font-medium text-foreground",
        styles.wrap,
        className,
      )}
      title={label}
    >
      <span className={cn(styles.emoji, "inline-grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-card/80", !showIcon && "hidden")} aria-hidden="true">{meta.emoji || meta.icon || "📁"}</span>
      <span className={cn("min-w-0", truncate && "truncate")}>{label}</span>
      {showSource && meta.source && (
        <span className="ml-0.5 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/70 dark:bg-white/10 dark:text-white/70">
          {meta.source}
        </span>
      )}
    </span>
  );
}
