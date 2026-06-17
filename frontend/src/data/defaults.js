export const DEFAULT_BUDGET_CATEGORIES = [
  "Housing", "Food & Dining", "Transportation", "Utilities",
  "Insurance", "Healthcare", "Entertainment", "Shopping",
  "Education", "Maaser / Tzedakah", "Savings", "Other",
];

export const DEFAULT_TRANSACTION_FORM = {
  amount: "",
  category: "",
  merchant_name: "",
  description: "",
  date: new Date().toISOString().split("T")[0],
  type: "expense",
};

export const DEFAULT_SETTINGS = {
  currency: "GBP",
  locale: "en-GB",
  fiscal_year_start: "2026-01-01",
  monthly_budget_day: 1,
  sms_enabled: false,
  email_notifications: true,
  ai_provider: "openai",
  ai_temperature: 0.7,
  theme: "system",
};

export const CURRENCIES = [
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "ILS", symbol: "₪", name: "Israeli Shekel" },
];
