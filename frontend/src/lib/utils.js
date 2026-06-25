import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const GENERIC_NAMES = new Set([
  "current account", "savings account", "statement account", "credit card",
]);

export function getDisplayName(account) {
  let name = account?.name || "";
  if (account?.provider && account.provider !== "manual") {
    if (!name || GENERIC_NAMES.has(name.toLowerCase())) {
      name = `${account.provider.charAt(0).toUpperCase() + account.provider.slice(1)} ${name || "Account"}`;
    }
  }
  return name || (account?.provider ? `${account.provider} Account` : "Unknown Account");
}
