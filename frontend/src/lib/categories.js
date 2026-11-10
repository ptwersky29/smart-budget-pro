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

const FALLBACK_CATEGORY_COLORS = {
  income: "#10b981",
  groceries: "#f59e0b",
  grocery: "#f59e0b",
  takeaway: "#f59e0b",
  restaurants: "#f97316",
  public_transport: "#3b82f6",
  transport: "#3b82f6",
  mobile_phone: "#3b82f6",
  utilities: "#38bdf8",
  house_supplies: "#ec4899",
  rent: "#8b5cf6",
  other_charity: "#eab308",
  charity: "#eab308",
  maaser_tzedakah: "#eab308",
};

// All 52 default budget categories, plus common transaction/category aliases.
// A user's explicitly chosen emoji always takes precedence over these suggestions.
export const DEFAULT_CATEGORY_EMOJIS = Object.freeze({
  "fruit_veg": "🥬",
  "grocery": "🛒",
  "bakery": "🥖",
  "fish": "🐟",
  "meat": "🥩",
  "paper_goods": "🧻",
  "takeaway": "🥡",
  "wine": "🍇",
  "house_supplies": "🧼",
  "chemist": "💊",
  "rent_mortgage": "🏠",
  "electricity": "⚡",
  "heating": "🌡️",
  "gas": "🔥",
  "water": "💧",
  "council_tax": "🏛️",
  "telephone": "☎️",
  "mobile": "📱",
  "cleaning_help": "🧹",
  "public_transport": "🚌",
  "car_lease": "🚗",
  "petrol_diesel": "⛽",
  "dart_charge": "🌉",
  "tolls": "🛣️",
  "tickets": "🎟️",
  "taxi": "🚕",
  "loan_payoff": "💳",
  "interest": "📉",
  "investments": "📈",
  "petty_cash": "💵",
  "taxes": "🧾",
  "upcoming_savings": "🐷",
  "trust_savings": "🏦",
  "school_fees": "🎓",
  "bus_fee": "🚍",
  "babysitting": "🧸",
  "nappies": "🍼",
  "toys": "🪀",
  "tutor": "📚",
  "therapy": "🩺",
  "medical": "🏥",
  "maaser_tzedakah": "🪙",
  "charity": "🤝",
  "other_charity": "💝",
  "mikva": "🕯️",
  "clothing_husband": "👔",
  "clothing_wife": "👚",
  "clothing_kids": "🧥",
  "shoes": "👟",
  "life_insurance": "🛡️",
  "buildings_insurance": "🏢",
  "miscellaneous": "📦",
  "restaurants": "🍽️",
  "parking": "🅿️",
  "internet": "🌐",
  "salary": "💼",
  "income": "💰",
  "travel": "🧳",
  "entertainment": "🎭",
  "shopping": "🛍️",
  "subscriptions": "🔁",
  "transfer": "🔄",
  "uncategorized": "📁",
});
const CATEGORY_EMOJI_ALIASES = Object.freeze({
  "groceries": "grocery",
  "vegetables": "fruit_veg",
  "fruit_and_veg": "fruit_veg",
  "restaurant": "restaurants",
  "restaurants": "restaurants",
  "dining": "restaurants",
  "food": "grocery",
  "transport": "public_transport",
  "tfl": "public_transport",
  "tfl_travel": "public_transport",
  "bus": "bus_fee",
  "petrol": "petrol_diesel",
  "fuel": "petrol_diesel",
  "parking": "parking",
  "rent": "rent_mortgage",
  "mortgage": "rent_mortgage",
  "housing": "rent_mortgage",
  "mobile_phone": "mobile",
  "phone": "mobile",
  "internet": "internet",
  "phone_internet": "internet",
  "utilities": "electricity",
  "salary": "salary",
  "income": "income",
  "wages": "salary",
  "savings": "upcoming_savings",
  "education": "school_fees",
  "school": "school_fees",
  "health": "medical",
  "pharmacy": "chemist",
  "donations": "charity",
  "maaser": "maaser_tzedakah",
  "tzedakah": "maaser_tzedakah",
  "insurance": "life_insurance",
  "travel": "travel",
  "entertainment": "entertainment",
  "shopping": "shopping",
  "subscriptions": "subscriptions",
  "transfer": "transfer",
  "uncategorized": "uncategorized",
  "uncategorised": "uncategorized",
});
const GENERIC_CATEGORY_EMOJIS = new Set(["🏷️", "📁", "❓"]);

export function suggestCategoryEmoji(name) {
  const key = slugifyCategoryName(name);
  const canonical = CATEGORY_EMOJI_ALIASES[key] || key;
  if (DEFAULT_CATEGORY_EMOJIS[canonical]) return DEFAULT_CATEGORY_EMOJIS[canonical];
  // Specific words, not arbitrary substrings, to avoid e.g. 'car' inside 'cards'.
  const words = key.split("_");
  const candidates = [
    ["parking", "🅿️"], ["bus", "🚌"], ["train", "🚆"], ["taxi", "🚕"],
    ["petrol", "⛽"], ["grocery", "🛒"], ["bakery", "🥖"], ["coffee", "☕"],
    ["restaurant", "🍽️"], ["school", "🎓"], ["charity", "🤝"],
    ["insurance", "🛡️"], ["medical", "🏥"], ["rent", "🏠"],
    ["phone", "📱"], ["savings", "🐷"], ["salary", "💼"],
  ];
  return candidates.find(([word]) => words.includes(word))?.[1] || "📁";
}

export function withCategoryEmoji(category) {
  if (!category) return category;
  const existing = category.emoji || category.icon;
  // Generic placeholder values are replaced by a useful default at display-time;
  // custom values remain untouched and no backend category data is modified.
  const emoji = existing && !GENERIC_CATEGORY_EMOJIS.has(existing)
    ? existing : suggestCategoryEmoji(category.name || category.slug || category.label);
  return { ...category, emoji, icon: emoji };
}

export const CATEGORY_EMOJI_OPTIONS = [
  "🥬",  "🛒",  "🥖",  "🐟",  "🥩",  "🧻",  "🥡",  "🍇",  "🧼",  "💊",
  "🏠",  "⚡",  "🌡️",  "🔥",  "💧",  "🏛️",  "☎️",  "📱",  "🧹",  "🚌",
  "🚗",  "⛽",  "🌉",  "🛣️",  "🎟️",  "🚕",  "💳",  "📉",  "📈",  "💵",
  "🧾",  "🐷",  "🏦",  "🎓",  "🚍",  "🧸",  "🍼",  "🪀",  "📚",  "🩺",
  "🏥",  "🪙",  "🤝",  "💝",  "🕯️",  "👔",  "👚",  "🧥",  "👟",  "🛡️",
  "🏢",  "📦",  "🍽️",  "🅿️",  "🌐",  "💼",  "💰",  "🧳",  "🎭",  "🛍️",
  "🔁",  "🔄",  "📁",  "🍷",  "🏡",  "🫶",  "🚇",  "🚧",  "🎫",  "📊",
  "🏷️",  "💷",  "🗂️",  "👗",  "🧒",  "💠",  "✨",  "⭐",  "🎯",  "🎉",
  "🎁",
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
    emoji: overrides.emoji || overrides.icon || suggestCategoryEmoji(name),
    icon: overrides.icon || overrides.emoji || suggestCategoryEmoji(name),
    color: overrides.color || FALLBACK_CATEGORY_COLORS[slug] || "#64748b",
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
