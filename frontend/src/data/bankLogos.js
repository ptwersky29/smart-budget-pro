const LOCAL_BASE = "/bank-logos";
const TRUSTLY_BASE = "https://content.trustly.com/logos/banks/GB";

export const BANK_LOGOS = {
  NatWest: {
    color: "#4f0599",
    name: "NatWest",
    file: "natwest.svg",
    trustly: "nwbk",
  },
  Barclays: {
    color: "#00aeef",
    name: "Barclays",
    file: "barclays.svg",
    trustly: "barc",
  },
  HSBC: { color: "#db0011", name: "HSBC", file: "hsbc.svg", trustly: "midl" },
  Santander: {
    color: "#ec0000",
    name: "Santander",
    file: "santander.svg",
    trustly: "abby",
  },
  Monzo: {
    color: "#ff3355",
    name: "Monzo",
    file: "monzo.svg",
    trustly: "monz",
  },
  TSB: { color: "#003a70", name: "TSB", file: "tsb.svg", trustly: "tsbs" },
  Lloyds: {
    color: "#00693e",
    name: "Lloyds",
    file: "lloyds.svg",
    trustly: "loyd",
  },
  Halifax: {
    color: "#003a6e",
    name: "Halifax",
    file: "halifax.svg",
    trustly: "hlfx",
  },
  Nationwide: {
    color: "#002b49",
    name: "Nationwide",
    file: "nationwide.svg",
    trustly: "naia",
  },
  Starling: {
    color: "#6935d2",
    name: "Starling",
    file: "starlingbank.svg",
    trustly: "srlg",
  },
  Revolut: {
    color: "#191c1f",
    name: "Revolut",
    file: "revolut.svg",
    trustly: "revo",
  },
  "First Direct": {
    color: "#146eb4",
    name: "First Direct",
    file: "firstdirect.svg",
    trustly: "hbuk",
  },
  "Co-operative": {
    color: "#136a8a",
    name: "Co-operative",
    file: "cooperative.svg",
    trustly: "cpbk",
  },
  Clydesdale: {
    color: "#006747",
    name: "Clydesdale",
    file: "clydesdale.svg",
    trustly: "clyd",
  },
  Yorkshire: {
    color: "#004b87",
    name: "Yorkshire",
    file: "yorkshire.svg",
    trustly: "york",
  },
  Danske: {
    color: "#003057",
    name: "Danske",
    file: "danske.svg",
    trustly: "daba",
  },
  Ulster: {
    color: "#c41e3a",
    name: "Ulster",
    file: "ulsterbank.svg",
    trustly: "ulsb",
  },
  "Bank of Scotland": {
    color: "#005b9f",
    name: "Bank of Scotland",
    file: "bankofscotland.svg",
    trustly: "bofs",
  },
  "Royal Bank of Scotland": {
    color: "#005b9f",
    name: "RBS",
    file: "royalbankofscotland.svg",
    trustly: "rbos",
  },
  "Metro Bank": {
    color: "#00a6d6",
    name: "Metro",
    file: "metro.svg",
    trustly: "mymb",
  },
  "Tesco Bank": {
    color: "#ee1c2e",
    name: "Tesco",
    file: "tesco.svg",
    trustly: "tpfg",
  },
  "Virgin Money": {
    color: "#da0530",
    name: "Virgin Money",
    file: "virginmoney.svg",
    trustly: "nrnb",
  },
  Chase: {
    color: "#117aca",
    name: "Chase",
    file: "chase.svg",
    trustly: "chas",
  },
  Triodos: { color: "#005340", name: "Triodos", file: "triodos.svg" },
  Coutts: {
    color: "#003a70",
    name: "Coutts",
    file: "coutts.svg",
    trustly: "cout",
  },
  Sainsbury: { color: "#ec7e00", name: "Sainsbury's", file: "sainsburys.svg" },
};

const NORMALIZED = {};
Object.entries(BANK_LOGOS).forEach(([key, val]) => {
  NORMALIZED[key.toLowerCase().replace(/[^a-z0-9]/g, "")] = val;
});

const ALIASES = {
  lloydsbank: "lloyds",
  lloydsbankgb: "lloyds",
  lloydsbankplc: "lloyds",
  firstdirectfb: "firstdirect",
  firstdirectgb: "firstdirect",
  starlingbank: "starling",
  starlingbankgb: "starling",
  royalbankofscotland: "royalbankofscotland",
  rbs: "royalbankofscotland",
  natwestgroup: "natwest",
  natwestgb: "natwest",
  mynatwest: "natwest",
  bankofscotland: "bankofscotland",
  bankofscotlandplc: "bankofscotland",
  halifaxgb: "halifax",
  halifaxplc: "halifax",
  nationwidegb: "nationwide",
  nationwidebuilding: "nationwide",
  nationwidebuildingociety: "nationwide",
  barclaysgb: "barclays",
  barclaysplc: "barclays",
  hsbcgb: "hsbc",
  hsbcplc: "hsbc",
  santanderuk: "santander",
  santanderukplc: "santander",
  tsbgb: "tsb",
  tsbplc: "tsb",
  monzobank: "monzo",
  monzobankgb: "monzo",
  revolutgb: "revolut",
  revolutltd: "revolut",
  chasegb: "chase",
  jpms: "chase",
  cooperativebank: "cooperative",
  cooperativebankgb: "cooperative",
  virginmoneygb: "virginmoney",
  virginmoneyuk: "virginmoney",
  tescobankgb: "tesco",
  tescoplc: "tesco",
  metrobankgb: "metro",
  metrobankplc: "metro",
  clydesdalebank: "clydesdale",
  clydesdalebankplc: "clydesdale",
  yorkshirebank: "yorkshire",
  yorkshirebankgb: "yorkshire",
  yorkshirebuilding: "yorkshire",
  danskebank: "danske",
  danskebankgb: "danske",
  ulsterbank: "ulster",
  ulsterbankgb: "ulster",
  ulsterbankltd: "ulster",
  triodosbank: "triodos",
  triodosgb: "triodos",
  couttsgb: "coutts",
  sainsburysbank: "sainsbury",
  sainsburysgb: "sainsbury",
};

const STRIP_WORDS = [
  "bank",
  "plc",
  "group",
  "uk",
  "ltd",
  "limited",
  "the",
  "of",
  "and",
];
function _stripSuffixes(s) {
  return STRIP_WORDS.reduce((cur, w) => {
    if (cur.endsWith(w)) return cur.slice(0, -w.length);
    return cur;
  }, s);
}

function _resolve(institution) {
  if (!institution) return null;
  let norm = institution.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ALIASES[norm]) norm = ALIASES[norm];
  let hit = NORMALIZED[norm];
  if (hit) return hit;
  const stripped = _stripSuffixes(norm);
  if (ALIASES[stripped]) return NORMALIZED[ALIASES[stripped]] || null;
  hit = NORMALIZED[stripped];
  if (hit) return hit;
  const words = institution.toLowerCase().split(/\s+/);
  for (const w of words) {
    const wn = w.replace(/[^a-z0-9]/g, "");
    if (ALIASES[wn] && NORMALIZED[ALIASES[wn]]) return NORMALIZED[ALIASES[wn]];
    if (NORMALIZED[wn]) return NORMALIZED[wn];
  }
  return null;
}

function _initialSvg(text, color) {
  const letter = (text || "?")[0].toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${color}"/><text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="18" fill="white">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function pickBankInstitution(...candidates) {
  const values = candidates.flat().filter(Boolean);
  for (const value of values) {
    if (_resolve(value)) return value;
  }
  return values[0] || null;
}

export function getBankLogoOrFallback(institution) {
  if (!institution) return null;
  const match = _resolve(institution);
  if (match?.file) return `${LOCAL_BASE}/${match.file}`;
  if (match?.trustly) return `${TRUSTLY_BASE}/${match.trustly}/round.svg`;
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
  if (type.includes("current") || type.includes("retail"))
    return "Current Account";
  if (type === "cash") return "Cash";
  if (type === "investment") return "Investment";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
