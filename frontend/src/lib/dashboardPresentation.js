import { humanizeCategoryName } from "./categories";

// Format backend alert labels for display only. Never modify category IDs
// or the amounts/percentages calculated by the financial backend.
export function formatDashboardAlertText(message) {
  return String(message || "").replace(/\b[A-Za-z]+(?:_[A-Za-z]+)+\b/g, token => {
    const name = humanizeCategoryName(token);
    return name.toLowerCase() === "maaser tzedakah" ? "Maaser & Tzedakah" : name;
  });
}
