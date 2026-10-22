const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCurrency(value, options = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return currencyFormatter.format(0);
  if (options.compact) return compactCurrencyFormatter.format(amount);
  if (options.absolute) return currencyFormatter.format(Math.abs(amount));
  if (options.signed) {
    return `${amount > 0 ? "+" : amount < 0 ? "-" : ""}${currencyFormatter.format(Math.abs(amount))}`;
  }
  return currencyFormatter.format(amount);
}

export function formatMoney(value, options = {}) {
  return formatCurrency(value, options);
}

export function formatPercent(value, options = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0%";
  return `${options.signed && amount > 0 ? "+" : ""}${Math.round(amount)}%`;
}

export function formatShortDate(value, options = {}) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...options,
  });
}

export function formatLongDate(value, options = {}) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    weekday: options.weekday === false ? undefined : "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatMonth(value, options = {}) {
  if (!value) return "";
  const [year, month] = String(value).split("-").map(Number);
  if (!year || !month) return "";
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: options.long ? "long" : "short",
    year: "numeric",
  });
}

export function formatRelativeTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatShortDate(date);
}

export function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
