const CDN_BASE = "https://cdn.simpleicons.org";
const LOCAL_BASE = "/bank-logos";

export const BANK_LOGOS = {
  "NatWest":               { slug: "natwest",               color: "#4f0599", name: "NatWest", file: "natwest.svg" },
  "Barclays":              { slug: "barclays",              color: "#00aeef", name: "Barclays", file: "barclays.svg" },
  "HSBC":                  { slug: "hsbc",                  color: "#db0011", name: "HSBC", file: "hsbc.svg" },
  "Santander":             { slug: "santander",             color: "#ec0000", name: "Santander", file: "santander.svg" },
  "Monzo":                 { slug: "monzo",                 color: "#ff3355", name: "Monzo", file: "monzo.svg" },
  "TSB":                   { slug: "tsb",                   color: "#003a70", name: "TSB", file: "tsb.svg" },
  "Lloyds":                { slug: "lloydsbank",            color: "#00693e", name: "Lloyds" },
  "Starling":              { slug: "starlingbank",          color: "#6935d2", name: "Starling" },
  "Revolut":               { slug: "revolut",               color: "#191c1f", name: "Revolut" },
  "Nationwide":            { slug: "nationwide",            color: "#002b49", name: "Nationwide" },
  "Halifax":               { slug: "halifax",               color: "#003a6e", name: "Halifax" },
  "First Direct":          { slug: "firstdirect",           color: "#146eb4", name: "First Direct" },
  "Co-operative":          { slug: "co-operative-bank",     color: "#136a8a", name: "Co-operative" },
  "Clydesdale":            { slug: "clydesdale",            color: "#006747", name: "Clydesdale" },
  "Yorkshire":             { slug: "yorkshire",             color: "#004b87", name: "Yorkshire" },
  "Danske":                { slug: "danske",                color: "#003057", name: "Danske" },
  "Ulster":                { slug: "ulsterbank",            color: "#c41e3a", name: "Ulster" },
  "Bank of Scotland":      { slug: "bankofscotland",        color: "#005b9f", name: "Bank of Scotland" },
  "Royal Bank of Scotland":{ slug: "royalbankofscotland",   color: "#005b9f", name: "RBS" },
  "Metro Bank":            { slug: "metro",                 color: "#00a6d6", name: "Metro" },
  "Tesco Bank":            { slug: "tesco",                 color: "#ee1c2e", name: "Tesco" },
  "Virgin Money":          { slug: "virginmoney",           color: "#da0530", name: "Virgin Money" },
  "Sainsbury":             { slug: "sainsburys",            color: "#ec7e00", name: "Sainsbury's" },
  "Triodos":               { slug: "triodos",               color: "#005340", name: "Triodos" },
  "Coutts":                { slug: "coutts",                color: "#003a70", name: "Coutts" },
  "Chase":                 { slug: "chase",                 color: "#117aca", name: "Chase" },
};

const NORMALIZED = {};
Object.entries(BANK_LOGOS).forEach(([key, val]) => {
  NORMALIZED[key.toLowerCase().replace(/[^a-z0-9]/g, "")] = val;
});

function _resolve(institution) {
  if (!institution) return null;
  const norm = institution.toLowerCase().replace(/[^a-z0-9]/g, "");
  return NORMALIZED[norm] || null;
}

function _initialSvg(text, color) {
  const letter = (text || "?")[0].toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${color}"/><text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="18" fill="white">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function getBankLogoUrl(institution) {
  if (!institution) return null;
  const match = _resolve(institution);
  if (match?.file) return `${LOCAL_BASE}/${match.file}`;
  if (match) return `${CDN_BASE}/${match.slug}`;
  const slug = institution.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${CDN_BASE}/${slug}`;
}

export function getBankLogoOrFallback(institution) {
  if (!institution) return null;
  const match = _resolve(institution);
  if (match?.file) return `${LOCAL_BASE}/${match.file}`;
  const color = match?.color || "#6b7280";
  const name = match?.name || institution;
  return _initialSvg(name, color);
}

export function getBankColor(institution) {
  if (!institution) return "#6b7280";
  const match = _resolve(institution);
  return match?.color || "#6b7280";
}

export function getInitials(institution) {
  if (!institution) return "?";
  const match = _resolve(institution);
  if (match) return match.name;
  return institution;
}

export function toAccountTypeLabel(type) {
  if (!type) return "Account";
  if (type.includes("credit")) return "Credit Card";
  if (type.includes("savings")) return "Savings";
  if (type.includes("current") || type.includes("retail")) return "Current Account";
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
