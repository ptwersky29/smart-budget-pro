import React from "react";
import { useCategories } from "../contexts/CategoriesContext";
import { cn } from "../lib/utils";
import { hexToRgba } from "../lib/categories";

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
}) {
  const { resolveCategory } = useCategories();
  const meta = typeof category === "string" || !category
    ? resolveCategory(category || "uncategorized")
    : resolveCategory(category.name || category.slug || category.label || "uncategorized", category);

  const styles = SIZE_STYLES[size] || SIZE_STYLES.md;
  const color = meta.color || "#64748b";
  const background = muted ? hexToRgba(color, 0.08) : hexToRgba(color, 0.14);
  const border = hexToRgba(color, muted ? 0.16 : 0.22);
  const label = meta.display_name || meta.label || meta.name;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center border font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]",
        styles.wrap,
        className,
      )}
      style={{
        backgroundColor: background,
        borderColor: border,
        color,
      }}
      title={label}
    >
      <span className={styles.emoji} aria-hidden="true">{meta.emoji || meta.icon || "🏷️"}</span>
      <span className={cn("min-w-0", truncate && "truncate")}>{label}</span>
      {showSource && meta.source && (
        <span className="ml-0.5 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/70 dark:bg-white/10 dark:text-white/70">
          {meta.source}
        </span>
      )}
    </span>
  );
}
