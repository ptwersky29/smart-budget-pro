export const DEFAULT_CATEGORY_SECTIONS = [
  "💰 Income",
  "❤️ Charity",
  "👕 Clothing",
  "🏠 Household",
  "🏠 Housing",
  "👦 Kids",
  "🧩 Ungrouped",
];

export const CATEGORY_COLOR_PALETTE = [
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#64748b",
  "#334155",
];

export const CATEGORY_EMOJI_OPTIONS = [
  "🛒", "🥬", "🥖", "🐟", "🥩", "🥡", "🍷", "🧼", "💊", "🏡",
  "⚡", "🔥", "💧", "🏛️", "☎️", "📱", "🧹", "🛡️", "🎓", "🚌",
  "🧸", "🍼", "🪀", "📚", "🫶", "🩺", "🚇", "🚗", "⛽", "🛣️",
  "🚧", "🎫", "💳", "📈", "📊", "💵", "🏷️", "🚕", "🕯️", "🧾",
  "📦", "💼", "💷", "🗂️", "🤝", "💝", "👔", "👗", "🧒", "👟",
  "💠", "✨", "⭐", "🎯", "🏠", "🏦", "💰", "🎉", "🎁", "🧳",
];

export function slugifyCategoryName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function humanizeCategoryName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Uncategorized";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function hexToRgba(hex, alpha = 1) {
  const raw = String(hex || "").trim();
  const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
  if (![3, 6].includes(normalized.length)) {
    return `rgba(100, 116, 139, ${alpha})`;
  }
  const full = normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized;
  const int = Number.parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function buildFallbackCategory(name, overrides = {}) {
  const slug = slugifyCategoryName(name) || String(name || "uncategorized").trim() || "uncategorized";
  const label = overrides.label || humanizeCategoryName(slug);
  return {
    category_id: overrides.category_id || `custom:${slug}`,
    name: slug,
    slug,
    label,
    display_name: label,
    emoji: overrides.emoji || overrides.icon || "🏷️",
    icon: overrides.icon || overrides.emoji || "🏷️",
    color: overrides.color || "#64748b",
    description: overrides.description || null,
    section: overrides.section || "🧩 Ungrouped",
    section_key: overrides.section_key || "ungrouped",
    section_label: overrides.section_label || "Ungrouped",
    section_emoji: overrides.section_emoji || "🏷️",
    is_income: Boolean(overrides.is_income),
    is_default: Boolean(overrides.is_default),
    is_archived: Boolean(overrides.is_archived),
    source: overrides.source || "Custom",
    can_delete: overrides.can_delete ?? slug !== "uncategorized",
    usage: overrides.usage || {
      transactions: 0,
      budgets: 0,
      recurring: 0,
      subscriptions: 0,
      rules: 0,
      total: 0,
    },
  };
}

export function buildSectionOptions(categories = []) {
  const seen = new Set(DEFAULT_CATEGORY_SECTIONS);
  const dynamic = [];
  categories.forEach((category) => {
    const section = category?.section?.trim();
    if (!section || seen.has(section)) return;
    seen.add(section);
    dynamic.push(section);
  });
  return [...DEFAULT_CATEGORY_SECTIONS, ...dynamic.sort((a, b) => a.localeCompare(b))];
}
