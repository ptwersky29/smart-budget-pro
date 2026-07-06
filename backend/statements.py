"""Statement upload + AI-parsed transactions (CSV / PDF)."""
import io
import csv
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Request, Depends, UploadFile, File, HTTPException, Form
from pydantic import BaseModel
from pypdf import PdfReader
from sqlalchemy import select, func, delete
from db import Transaction, Statement, MaaserLedger
from auth import get_current_user
import maaser as maaser_mod

logger = logging.getLogger("statements")

MAX_BYTES = 5 * 1024 * 1024
MAX_CHARS_TO_AI = 40000

# ── Expanded category hierarchy ─────────────────────────────────────────
# Each section maps to a list of (category_slug, display_label) tuples.
# The slug is stored in DB; display_label is shown in UI.
CATEGORY_HIERARCHY = {
    "❤️ Charity": [
        ("maaser_tzedakah", "Maaser-Tzedakah (10%)"),
        ("charity", "Charity"),
        ("other_charity", "Other Charity"),
    ],
    "👕 Clothing": [
        ("clothing_husband", "Husband"),
        ("clothing_wife", "Wife"),
        ("clothing_kids", "Kids"),
        ("shoes", "Shoes"),
    ],
    "🏠 Household": [
        ("fruit_veg", "Fruit & Veg"),
        ("grocery", "Grocery"),
        ("bakery", "Bakery"),
        ("fish", "Fish"),
        ("meat", "Meat"),
        ("paper_goods", "Paper goods (Kitchen roll/Tissues)"),
        ("takeaway", "Takeaway"),
        ("wine", "Wine"),
        ("house_supplies", "House Supplies"),
        ("chemist", "Chemist / Pharmacy"),
    ],
    "🏠 Housing": [
        ("rent_mortgage", "Rent / Mortgage"),
        ("electricity", "Electricity"),
        ("heating", "Heating"),
        ("gas", "Gas"),
        ("water", "Water"),
        ("council_tax", "Council Tax / Bin Collection"),
        ("telephone", "Telephone (Landline)"),
        ("mobile", "Mobile Phone"),
        ("cleaning_help", "Cleaning Help"),
        ("life_insurance", "Life Insurance"),
        ("buildings_insurance", "Buildings & Contents Insurance"),
    ],
    "👦 Kids": [
        ("school_fees", "School Fees / Tuition"),
        ("bus_fee", "Bus Fee"),
        ("babysitting", "Babysitting"),
        ("nappies", "Nappies"),
        ("trust_savings", "Trust / Savings"),
        ("toys", "Toys"),
        ("tutor", "Tutor"),
        ("therapy", "Therapy"),
        ("medical", "Medical / Prescriptions"),
    ],
    "🧩 Ungrouped": [
        ("public_transport", "Public Transport"),
        ("car_lease", "Car Lease"),
        ("petrol_diesel", "Petrol / Diesel"),
        ("dart_charge", "Dart Charge / Congestion Charge"),
        ("tolls", "Tolls"),
        ("tickets", "Tickets (Fines / Parking)"),
        ("loan_payoff", "Loan Payoff"),
        ("interest", "Interest Charges"),
        ("investments", "Other Investments"),
        ("petty_cash", "Petty Cash"),
        ("miscellaneous", "Miscellaneous"),
        ("taxi", "Taxi"),
        ("mikva", "Mikva"),
        ("taxes", "Taxes (HMRC / Income Tax)"),
        ("upcoming_savings", "Upcoming Expenses Savings"),
    ],
    "💰 Income": [
        ("salary", "Salary"),
        ("income", "Income"),
    ],
}

# Map old category slugs → new slugs for backward compatibility
CATEGORY_ALIASES = {
    "groceries": "grocery",
    "dining": "takeaway",
    "transport": "public_transport",
    "fuel": "petrol_diesel",
    "parking": "dart_charge",
    "car_maintenance": "miscellaneous",
    "car_hire": "miscellaneous",
    "taxi": "taxi",
    "utilities": "house_supplies",
    "electricity": "electricity",
    "gas": "gas",
    "water": "water",
    "internet": "miscellaneous",
    "phone": "telephone",
    "council_tax": "council_tax",
    "education": "school_fees",
    "school_fees": "school_fees",
    "tuition": "tutor",
    "books": "miscellaneous",
    "childcare": "babysitting",
    "children": "nappies",
    "health": "medical",
    "medical": "medical",
    "dental": "medical",
    "pharmacy": "chemist",
    "optical": "medical",
    "gym": "miscellaneous",
    "fitness": "miscellaneous",
    "therapy": "therapy",
    "tzedakah": "charity",
    "maaser": "maaser_tzedakah",
    "shul_donations": "other_charity",
    "mikvah": "mikva",
    "jewish_education": "other_charity",
    "pesach": "miscellaneous",
    "succah": "miscellaneous",
    "purim": "miscellaneous",
    "chanukah": "miscellaneous",
    "shavuos": "miscellaneous",
    "rosh_hashanah": "miscellaneous",
    "yom_kippur": "miscellaneous",
    "wedding": "miscellaneous",
    "bar_bas_mitzvah": "miscellaneous",
    "bris": "miscellaneous",
    "engagement": "miscellaneous",
    "sheva_brachos": "miscellaneous",
    "gifts": "charity",
    "travel": "miscellaneous",
    "flights": "miscellaneous",
    "hotels": "miscellaneous",
    "holiday": "miscellaneous",
    "business": "miscellaneous",
    "office_supplies": "house_supplies",
    "software": "miscellaneous",
    "advertising": "miscellaneous",
    "entertainment": "miscellaneous",
    "streaming": "miscellaneous",
    "subscriptions": "miscellaneous",
    "hobbies": "miscellaneous",
    "shopping": "miscellaneous",
    "clothing": "clothing_husband",
    "electronics": "miscellaneous",
    "rent": "rent_mortgage",
    "mortgage": "rent_mortgage",
    "insurance": "life_insurance",
    "tax": "taxes",
    "fees": "interest",
    "transfer": "miscellaneous",
    "cash": "petty_cash",
    "investments": "investments",
    "salary": "salary",
    "income": "income",
    "household": "house_supplies",
    "home_improvement": "house_supplies",
    "laundry": "house_supplies",
    "kitchen": "house_supplies",
    "cleaning": "house_supplies",
    "furniture": "miscellaneous",
    "charity": "charity",
}

def resolve_category(cat: str) -> str:
    """Resolve an old/new category slug to the canonical new slug."""
    if not cat:
        return "miscellaneous"
    c = cat.lower().strip().replace(" ", "_")
    return CATEGORY_ALIASES.get(c, c)

# Derived sets
ALL_CATEGORY_NAMES = {name for section in CATEGORY_HIERARCHY.values() for name, _ in section}
INCOME_CATEGORIES = {"salary", "income"}
EXPENSE_CATEGORIES = ALL_CATEGORY_NAMES - INCOME_CATEGORIES
ALL_CATEGORIES = ALL_CATEGORY_NAMES | {"uncategorized"}
CATEGORIES = sorted(ALL_CATEGORIES)
SECTION_FOR_CATEGORY = {}
for section, items in CATEGORY_HIERARCHY.items():
    for name, _ in items:
        SECTION_FOR_CATEGORY[name] = section

PARSE_PROMPT = """You are a UK bank statement parser. Below is text extracted from a bank statement (CSV or PDF).
Extract every transaction as JSON. Return STRICT JSON only — no markdown, no commentary.

INCOME vs EXPENSE RULES — this is CRITICAL:
- INCOME = money coming IN (salary, wages, refunds, interest, dividends, cashback, transfers IN, credits)
  → amount MUST be POSITIVE (e.g. 1500.00)
  → category = "salary" or "income"
- EXPENSE = money going OUT (purchases, bills, fees, transfers OUT, debits, withdrawals)
  → amount MUST be NEGATIVE (e.g. -45.99)
  → category = one of: maaser_tzedakah, charity, other_charity, clothing_husband, clothing_wife, clothing_kids, shoes, fruit_veg, grocery, bakery, fish, meat, paper_goods, takeaway, wine, house_supplies, chemist, rent_mortgage, electricity, heating, gas, water, council_tax, telephone, mobile, cleaning_help, life_insurance, buildings_insurance, school_fees, bus_fee, babysitting, nappies, trust_savings, toys, tutor, therapy, medical, public_transport, car_lease, petrol_diesel, dart_charge, tolls, tickets, loan_payoff, interest, investments, petty_cash, miscellaneous, taxi, mikva, taxes, upcoming_savings

Schema:
{
  "currency": "GBP|USD|EUR",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": string,
      "merchant": string|null,
      "amount": number,
      "category": string,
      "is_income": bool,
      "confidence": 0..1
    }
  ]
}

Rules:
- Use ISO date format YYYY-MM-DD.
- Amount sign: POSITIVE for income (salary, interest, refunds, credits), NEGATIVE for expenses (purchases, bills, debits).
- categorise EVERY transaction — never leave as "uncategorized".
- Skip header rows, balance lines, and footnotes.
- Cap to 200 transactions.

STATEMENT TEXT:
"""


class SaveIn(BaseModel):
    statement_id: str


def _pdf_to_text(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    parts = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception as e:
            logger.warning(f"pdf page extract failed: {e}")
    return "\n".join(parts)


def _csv_to_text(content: bytes) -> str:
    text = content.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    lines = []
    for i, row in enumerate(reader):
        lines.append(" | ".join(c.strip() for c in row))
        if i > 1000:
            break
    return "\n".join(lines)


async def _ai_parse_statement(text: str, session=None, user_id: str = None) -> dict:
    from llm import call_llm, parse_json as llm_parse, track_ai_usage
    raw, provider, model, pt, ct, cost = await call_llm(
        "You are a precise UK bank statement parser. Always output valid JSON only.",
        PARSE_PROMPT + text[:MAX_CHARS_TO_AI],
        json_mode=True,
    )
    if session and user_id:
        await track_ai_usage(session, user_id, provider, model, pt, ct, cost, endpoint="statement_parse")
    try:
        return llm_parse(raw)
    except ValueError as e:
        raise RuntimeError(f"AI JSON parse failed: {e}")


CATEGORISE_KEYWORDS = {
    "maaser_tzedakah": ["maaser", "maaser money", "maaser fund", "tithe", "maaser tzedakah"],
    "charity": ["chesed", "tzedakah", "tzedaka", "donation", "charity", "terumah", "gift aid", "justgiving", "jgive", "gofundme", "go fund me", "world jewish relief", "jnf", "jewish national fund", "chabad", "jewish charity", "yeshiva", "kollel", "shul donation"],
    "other_charity": ["shul", "synagogue", "shul membership", "shul donation", "shul fund", "minyan", "minyan sponsor", "kiddush sponsor", "jewish school", "jewish education", "hebrew school", "cheder", "jewish studies", "torah class", "seminary", "jewish learning"],
    "clothing_husband": ["clothing men", "menswear", "mens clothing", "suit", "tie", "shirt men", "trousers", "blazer", "polo men"],
    "clothing_wife": ["clothing women", "womenswear", "womens clothing", "dress", "skirt", "blouse", "handbag", "jewelry"],
    "clothing_kids": ["children clothing", "kids clothing", "baby clothes", "childrenswear", "school uniform", "blazer school", "jumper school", "kids wear"],
    "shoes": ["shoe", "trainer", "boot", "sandal", "sneaker", "loafer", "heel", "clarks", "schuh", "office shoe", "sports direct shoe"],
    "grocery": ["tesco", "sainsbury", "asda", "waitrose", "lidl", "aldi", "morrison", "morrisons", "co-op", "coop", "m&s food", "marks & spencer", "m&s simply food", "iceland", "farmfoods", "budgens", "spar", "spar ", "nisa", "londis", "supermarket", "tesco metro", "sainsbury's", "ocado", "grocery", "food shop", "weekly shop", "kosher"],
    "fruit_veg": ["fruit", "vegetable", "greengrocer", "market fruit", "veg box", "fruit stall", "fruit and veg"],
    "bakery": ["bakery", "bread", "baguette", "croissant", "pastry", "cake", "doughnut", "bagel shop", "greggs", "baker"],
    "fish": ["fish", "fishmonger", "seafood", "cod", "salmon", "haddock", "prawn", "fish shop", "fish stall"],
    "meat": ["butcher", "meat", "steak", "chicken breast", "beef", "lamb", "pork", "mince", "sausage", "bacon", "deli meat", "kosher butcher", "meat shop"],
    "paper_goods": ["kitchen roll", "tissue", "toilet paper", "paper towel", "tissue box", "napkin", "paper goods"],
    "takeaway": ["mcdonald", "nando", "kfc", "subway", "subway ", "pret a manger", "pret", "pret ", "starbucks", "costa", "costa ", "cafe nero", "cafe", "coffee", "wagamama", "pizza hut", "dominos", "papa johns", "deliveroo", "uber eats", "uber_eats", "just eat", "justeat", "restaurant", "pizza", "cafe ", "café", "bistro", " pub ", "bar ", "grill", "kitchen", "diner", "brasserie", "eatery", "bagel", "sushi", "noodle", " thai", " indian", " chinese", "chippy", "fish & chips", "greek", "burger", "kebab", "taco", "burrito", "greggs", "leon", "leon ", "wasabi", "itsu", "dishoom", "yo! sushi", "pizzaexpress", "zizzi", "ask italian", "prezzo", "frankie & benny", "toby carvery", "harvester", "beefeater", "brewers fayre", "wethers", "spoons", "weatherspoon", "jamie oliver", "gordon ramsay", "m&s food to go", "meal deal", "breakfast", "lunch", "dining", "takeaway"],
    "wine": ["wine", "wine shop", "majestic wine", "laithwaites", "naked wines", "whisky", "beer shop", "off licence", "off license"],
    "house_supplies": ["b&q", "wickes", "screwfix", "toolstation", "homebase", "ikea", "dunelm", "habitat", "made.com", "furniture", "sofa", "bed", "wardrobe", "table", "chair", "shelving", "bookshelf", "storage", "carpet", "flooring", "tile", "curtains", "blinds", "decor", "paint", "wallpaper", "plumbing", "electrical", "building materials", "garden centre", "plants", "gardening", "diy", "household", "home improvement", "cleaning", "cleaner", "domestic help", "housekeeping", "dry cleaning", "laundry", "washing", "launderette", "cleaning supplies", "detergent", "fabric softener", "washing up", "dishwasher tablet", "ryman", "whsmith", "office supply", "stationery"],
    "chemist": ["boots", "superdrug", "lloyds pharmacy", "pharmacy", "prescription", "medication", "medicine", "chemist"],
    "rent_mortgage": ["rent", " rent ", "landlord", "letting agent", "foxtons", "savills", "knight frank", "tenancy", "lease", "property management", "ground rent", "service charge", "mortgage", "halifax", "natwest", "santander", "barclays", "lloyds", "hsbc", "first direct", "yorkshire bs", "skipton", "nationwide"],
    "electricity": ["electricity", "electric bill", "edf energy", "edf", "e.on", "eon", "octopus energy", "octopus", "british gas", "npower", "scottish power", "bulb", "ovo", "ovo energy"],
    "heating": ["heating", "central heating", "boiler", "oil", "heating oil", "calor gas", "bottled gas"],
    "gas": ["gas bill", "british gas", "edf", "e.on", "eon", "octopus", "npower"],
    "water": ["thames water", "water bill", "anglian water", "yorkshire water", "severn trent", "southern water", "welsh water", "united utilities"],
    "council_tax": ["council tax", "council tax band", "bin collection", "bins", "bins collection"],
    "telephone": ["bt", "bt ", "phone bill", "landline", "talk talk", "plusnet phone", "telephone"],
    "mobile": ["vodafone", "ee", "ee ", " three", " three ", "o2", "o2 ", "giffgaff", "tesco mobile", "lebara", "lycamobile", "smarty", "mobile phone"],
    "cleaning_help": ["cleaning help", "cleaner", "domestic help", "housekeeper", "cleaning service", "home help"],
    "life_insurance": ["life insurance", "aviva", "direct line", "admiral", "lv=", "liverpool victoria", "churchill", "compare the market", "gocompare", "go compare", "money supermarket", "moneysupermarket", "axa", "zurich", "legal & general", "scottish widows", "standard life", "hastings", "esure", "saga", "car insurance", "home insurance", "pet insurance", "travel insurance", "breakdown cover", "aa", "rac", "petplan", "animal friends"],
    "buildings_insurance": ["buildings insurance", "contents insurance", "home insurance", "house insurance", "property insurance"],
    "school_fees": ["school fee", "school fees", "school payment", "nursery fee", "nursery", "preschool", "childcare", "school trip", "school dinner", "school lunch", "tuition fee", "university", "ucas", "udemy", "coursera", "linkedin learning", "skillshare", "masterclass", "futurelearn", "open university"],
    "bus_fee": ["bus fee", "school bus", "bus pass", "student bus", "school bus pass"],
    "babysitting": ["babysitter", "babysitting", "nanny", "childminder", "creche", "child care", "childcare", "nursery fees", "daycare"],
    "nappies": ["nappies", "nappy", "diaper", "pampers", "huggies", "baby wipes", "baby lotion", "baby care"],
    "trust_savings": ["trust fund", "child trust", "junior isa", "child savings", "kids savings", "childrens savings", "trust savings"],
    "toys": ["toy", "toys", "lego", "barbie", "game", "action figure", "board game", "puzzle", "kids toy", "toy shop", "the entertainer", "smyths"],
    "tutor": ["tutor", "tutoring", "private tuition", "private tutor", "maths tutor", "english tutor", "music lesson", "piano lesson", "swimming lesson", "extra curricular", "tuition"],
    "therapy": ["therapy", "counselling", "psychologist", "psychiatrist", "mental health", "therapist", "physio", "chiropractor", "cbt", "cognitive behavioural"],
    "medical": ["nhs", "hospital", "clinic", "doctor", "gp", "consultant", "surgeon", "operation", "surgery", "dentist", "dental", "dental check", "hygienist", "orthodontist", "braces", "dental practice", "optician", "specsavers", "vision express", "glasses", "contact lens", "eye test", "optometry", "boots", "superdrug", "lloyds pharmacy", "pharmacy", "prescription", "medication", "medicine", "medical", "prescriptions"],
    "public_transport": ["trainline", "national rail", "stagecoach", "arriva", "first bus", "tfl", "oyster", "tube", "underground", "southern railway", "thameslink", "south western", "southwestern", "great western", "lner", "avanti", "crosscountry", "chiltern", "c2c", "bus", "bus ticket", "train ticket", "tube ticket", "tram", "metro", "national express", "railway", "rail"],
    "car_lease": ["car lease", "lease car", "car finance", "pcp", "hire purchase", "motability", "car leasing"],
    "petrol_diesel": ["shell", "shell ", "bp", " bp ", "esso", "texaco", "petrol", "diesel", "unleaded", "ev charge", "charging", "charging point", "pod point", "fuel", "applegreen", "gulf", "jet", "murco", "total", "bp pulse"],
    "dart_charge": ["dart charge", "dartford", "congestion charge", "ulez", "c upfront", "parking", "ncp", "apcoa", "ringgo", "paybyphone", "parking eye", "civil enforcement"],
    "tolls": ["toll", "toll road", "m6 toll", "m25", "bridge toll", "road charge"],
    "tickets": ["parking fine", "speeding fine", "penalty charge", "pc n", "fixed penalty", "court fine", "ticket", "fine", "penalty"],
    "loan_payoff": ["loan payment", "loan repayment", "loan payoff", "personal loan", "debt repayment", "credit card payment", "credit card repay", "loan"],
    "interest": ["fee", "charge", "penalty", "interest charge", "overdraft", "o/d fee", "bank fee", "monthly fee", "service charge", "account fee", "late payment", "bank charge", "foreign transaction", "conversion fee", "credit card fee", "interest"],
    "investments": ["vanguard", "fidelity", "hargreaves lansdown", "trading212", "freetrade", "invest", "stocks", "shares", "isa", "pension", "s&p 500", "s&p", "fund", "etf", "investment", "dividend deposit", "interest deposit", "dividend"],
    "petty_cash": ["cash", "atm", "atm withdrawal", "atm ", "cashpoint", "link ", "withdrawal", "cash withdrawal", "cashback", "petty cash"],
    "miscellaneous": ["amazon", "ebay", "etsy", "argos", "john lewis", "amazon.co.uk", "amazon.com", "currys", "pc world", "apple store", "john lewis electrical", "very", "ao.com", "next", "next ", "zara", "h&m", "primark", "tk maxx", "matalan", "asos", "boohoo", "river island", "new look", "debenhams", "selfridges", "harrods", "nike", "adidas", "sports direct", "jd sports", "footasylum", "clothing", "fashion", "netflix", "spotify", "disney+", "disney plus", "apple tv", "apple.com/bill", "apple.com", "icloud", "google one", "youtube premium", "paramount", "now tv", "hbo", "tidal", "deezer", "audible", "kindle unlimited", "chatgpt", "openai", "microsoft 365", "office 365", "dropbox", "adobe", "notion", "slack", "zoom", "patreon", "onlyfans", "medium", "substack", "github", "gitlab", "digitalocean", "aws", "google cloud", "azure", "namecheap", "godaddy", "cloudflare", "wordpress", "shopify", "wix", "squarespace", "google ads", "facebook ads", "linkedin ads", "instagram ads", "tiktok ads", "social media ad", "cpc", "ppc", "advertising", "marketing", "sponsored", "odeon", "vue", "vue cinema", "vue ", "cineworld", "showcase", " cinema", "theatre", "concert", "stubhub", "viagogo", "eventim", "ticketmaster", "museum", "gallery", "zoo", "attraction", "theme park", "bowling", "escape room", "waterstones", "books", "bookshop", "national trust", "english heritage", "steam", "steam ", "playstation", "xbox", "nintendo", "epic games", "gog.com", "hobbies", "craft", "sewing", "knitting", "decathlon", "puregym", "david lloyd", "nuffield", "anytime fitness", "the gym", "gym", "fitness", "gym membership", "better gym", "better", "everyone active", "virgin active", "bannatyne", "leisure centre", "faster payment", "bacs", "chaps", "standing order", "direct debit", "monzo to monzo", "revolut", "wise", "wise ", "paypal", "venmo", "zelle", "bank transfer", "ryanair", "easyjet", "british airways", "ba.com", "wizz air", "jet2", "virgin atlantic", "emirates", "qatar", "expedia", "booking.com", "hotel", "airbnb", "tripadvisor", "skyscanner", "kayak", "trailfinders", "travel agent", "premier inn", "travelodge", "hilton", "marriott", "ibis", "holiday inn", "enterprise rent", "hertz", "avis", "budget rent", "europcar", "sixt", "rental car", "car hire", "van hire", "tui", "thomas cook", "holiday", "vacation", "lastminute.com", "loveholidays", "on the beach", "jet2holidays", "all inclusive", "package holiday", "ski holiday", "beach holiday", "office", "business", "professional", "consultancy", "contractor", "self employed", "electrical", "laptop", "phone", "game", "game ", "office", "wilko"],
    "taxi": ["uber", "bolt", "lyft", "free now", "viavan", "addison lee", "uber trip", "uber ride", "taxi", "minicab", "private hire"],
    "mikva": ["mikvah", "mikveh", "mikva", "ritual bath", "mikvah fee"],
    "taxes": ["hmrc", "self assessment", "vat payment", "income tax", "tax return", "corporation tax", "tax bill", "tax", "stamp duty", "capital gains", "vat"],
    "upcoming_savings": ["savings", "saving", "regular saver", "easy access", "savings account", "savings pot", "monzo pot", "starling space", "savings deposit"],
    "income": ["salary", "wages", "payroll", "hmrc repayment", "employment", "pay", "earnings", "refund", "interest", "dividend", "tax refund", "cashback", "rebate", "bonus", "commission", "freelance", "benefits", "universal credit", "child benefit", "pension", "state pension", "investment income", "tax credit", "interest income", "cashback reward"],
}


def _keyword_categorise(description: str, merchant: str | None, amount: float) -> str | None:
    """Fast keyword-based categorisation. Returns canonical slug if confident, else None.
    Resolves old category keys via CATEGORY_ALIASES.
    Amount-aware: small supermarket tx (< £10) → takeaway, not grocery."""
    text = f" {(description or '').lower()} {(merchant or '').lower()} "
    if not text.strip():
        return None
    abs_amt = abs(amount)
    for category, keywords in CATEGORISE_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                if category in ("income", "salary") and amount <= 0:
                    continue
                # Amount-aware: small supermarket tx is likely a meal deal/snack → takeaway
                if category in ("grocery", "fruit_veg", "bakery", "fish", "meat") and abs_amt < 10:
                    return "takeaway"
                return category
    return None


CATEGORISE_PROMPT = """You are a UK bank transaction categoriser. Think step by step: consider the merchant name, the description text, AND the amount together — the same merchant can mean different categories depending on what was bought and how much was spent.

SIGN: amount > 0 = money IN (income). amount < 0 = money OUT (expense).

CATEGORY HIERARCHY (pick one category slug from below):

❤️ Charity: maaser_tzedakah (10% maaser), charity (other charity), other_charity (shul, jewish education)
👕 Clothing: clothing_husband, clothing_wife, clothing_kids, shoes
🏠 Household: fruit_veg, grocery (supermarket), bakery, fish, meat, paper_goods (kitchen roll/tissues), takeaway (restaurants, takeout), wine, house_supplies (DIY, cleaning), chemist (pharmacy)
🏠 Housing: rent_mortgage, electricity, heating, gas, water, council_tax, telephone (landline), mobile, cleaning_help, life_insurance, buildings_insurance
👦 Kids: school_fees, bus_fee, babysitting, nappies, trust_savings, toys, tutor, therapy, medical
🧩 Ungrouped: public_transport, car_lease, petrol_diesel, dart_charge (congestion), tolls, tickets (fines), loan_payoff, interest (bank fees), investments, petty_cash, miscellaneous (everything else), taxi, mikva, taxes (HMRC), upcoming_savings
💰 Income: salary, income

MERCHANT → CATEGORY (with amount-aware logic):
- Tesco/Sainsbury/Asda/Waitrose/Lidl/Aldi/Co-op/Morrisons: if abs(amount) < 10 → takeaway, if abs(amount) >= 10 → grocery
- McDonald/Nando/KFC/Pret/Starbucks/Costa → takeaway (always)
- Deliveroo/Uber Eats/JustEat → takeaway; Uber trip/ride → taxi
- TfL/Oyster → public_transport; Shell/BP/Esso → petrol_diesel
- Trainline/raileasy → public_transport
- British Gas/EDF/Eon/Octopus → gas or electricity
- Netflix/Spotify/Disney+/YouTube Premium → miscellaneous
- Amazon → miscellaneous (shopping)
- Boots/Lloyds/Superdrug → chemist; Specsavers → medical
- eBay/Amazon/Argos/John Lewis → miscellaneous
- HMRC/VAT → taxes
- BT/Sky/Virgin/Vodafone/EE → telephone or mobile
- ATM/WITHDRAWAL → petty_cash
- Faster payment/standing order/PayPal: if "salary/wages/payroll" → income; if "transfer"/"payment" → miscellaneous
- Charity/Donation/Tzedakah/JGive → charity; maaser-specific → maaser_tzedakah
- Rent/mortgage payment → rent_mortgage (abs(amount) > 500 likely)
- Dentist/Doctor/Prescription → medical
- Gym/Fitness/ClassPass → miscellaneous
- Cinema/Theatre/Event/Ticket → miscellaneous
- Coursera/Udemy/Skillshare → school_fees

Also acceptable: uncategorized

Output STRICT JSON only: {{"category": "<one slug from above>"}}

Transaction: {description}
Merchant: {merchant}
Amount: {amount}
"""


def _fix_sign(tx: dict) -> dict:
    """Ensure amount sign matches the category (income=positive, expense=negative)."""
    cat = tx.get("category", "uncategorized").lower()
    amt = tx.get("amount", 0)
    try:
        amt = float(amt)
    except (TypeError, ValueError):
        amt = 0.0
    if cat in INCOME_CATEGORIES and amt < 0:
        tx["amount"] = abs(amt)
        tx["is_income"] = True
    elif cat in EXPENSE_CATEGORIES and amt > 0:
        tx["amount"] = -abs(amt)
        tx["is_income"] = False
    else:
        tx["is_income"] = amt > 0
    return tx


async def _ai_categorise(description: str, merchant: str | None, amount: float, session=None, user_id: str = None) -> str:
    from llm import call_llm, parse_json as llm_parse, track_ai_usage
    from db import CategoryRule
    # Fast path: keyword matching for obvious cases
    fast = _keyword_categorise(description, merchant, amount)
    if fast:
        return fast
    if session and user_id and merchant:
        try:
            key = (merchant or "").strip().upper()
            if key:
                r = await session.execute(
                    select(CategoryRule).where(
                        CategoryRule.user_id == user_id,
                        CategoryRule.merchant == key,
                    )
                )
                rule = r.scalar_one_or_none()
                if rule:
                    rule.match_count = (rule.match_count or 0) + 1
                    from datetime import datetime, timezone as _tz
                    rule.last_used_at = datetime.now(_tz.utc)
                    return rule.category
        except Exception:
            pass
    prompt = CATEGORISE_PROMPT.format(
        description=description[:100],
        merchant=merchant or "unknown",
        amount=amount,
    )
    try:
        raw, provider, model, pt, ct, cost = await call_llm(
            "You categorise bank transactions. Output valid JSON only.",
            prompt, json_mode=False,
        )
        if session and user_id:
            await track_ai_usage(session, user_id, provider, model, pt, ct, cost, endpoint="statement_categorize")
        data = llm_parse(raw)
        cat = str(data.get("category", "uncategorized")).lower().strip()
        return cat if cat in ALL_CATEGORIES else "uncategorized"
    except Exception:
        return "uncategorized"


def build_router() -> APIRouter:
    router = APIRouter(prefix="/statements", tags=["statements"])

    @router.post("/upload")
    async def upload(request: Request, file: UploadFile = File(...),
                     account_id: str = Form(None),
                     user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            content = await file.read()
            if len(content) > MAX_BYTES:
                raise HTTPException(413, "File too large (max 5 MB)")
            if len(content) == 0:
                raise HTTPException(400, "Empty file")

            fname = (file.filename or "").lower()
            kind = "unknown"
            text = ""
            if fname.endswith(".pdf") or (file.content_type or "").endswith("pdf"):
                kind = "pdf"
                try:
                    text = _pdf_to_text(content)
                except Exception as e:
                    raise HTTPException(400, f"Could not read PDF: {e}")
            elif fname.endswith(".csv") or (file.content_type or "").endswith("csv"):
                kind = "csv"
                text = _csv_to_text(content)
            else:
                raise HTTPException(400, "Only .csv or .pdf files are supported")

            if len(text.strip()) < 20:
                raise HTTPException(400, "Could not extract any text from the file")

            parsed = {}
            try:
                parsed = await _ai_parse_statement(text, session, user["user_id"])
            except Exception as e:
                logger.error(f"ai parse failed: {e}")
                raise HTTPException(500, f"AI parsing failed: {str(e)[:200]}")

            txs = parsed.get("transactions", []) or []
            clean = []
            for t in txs[:200]:
                try:
                    tx = _fix_sign({
                        "date": str(t.get("date", ""))[:10],
                        "description": str(t.get("description", ""))[:200],
                        "merchant": (str(t["merchant"])[:120] if t.get("merchant") else None),
                        "amount": float(t.get("amount", 0)),
                        "category": str(t.get("category", "uncategorized")).lower(),
                        "is_income": bool(t.get("is_income")),
                        "confidence": float(t.get("confidence", 0.5)),
                    })
                    clean.append(tx)
                except Exception:
                    continue

            uncat = [t for t in clean if t["category"] == "uncategorized"]
            if uncat:
                logger.info(f"Re-categorising {len(uncat)} uncategorised transactions")
                for t in uncat:
                    new_cat = await _ai_categorise(t["description"], t.get("merchant"), t["amount"], session, user["user_id"])
                    t["category"] = new_cat
                    _fix_sign(t)

            stmt = Statement(
                user_id=user["user_id"],
                account_id=account_id,
                period_start=None,
                period_end=None,
                total_income=sum(t["amount"] for t in clean if t["amount"] > 0),
                total_expenses=sum(-t["amount"] for t in clean if t["amount"] < 0),
                currency=parsed.get("currency", "GBP"),
                data={"filename": file.filename, "kind": kind, "size_bytes": len(content), "transactions": clean},
                status="draft",
            )
            session.add(stmt)
            await session.commit()
            await session.refresh(stmt)

            return {
                "statement_id": f"stmt_{stmt.id}",
                "filename": file.filename,
                "kind": kind,
                "currency": parsed.get("currency", "GBP"),
                "transaction_count": len(clean),
                "transactions": clean,
            }

    @router.get("")
    async def list_statements(request: Request, account_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            q = select(Statement).where(Statement.user_id == user["user_id"])
            if account_id:
                q = q.where(Statement.account_id == account_id)
            
            result = await session.execute(q.order_by(Statement.created_at.desc()).limit(50))
            rows = result.scalars().all()
            return {"statements": [
                {
                    "id": f"stmt_{r.id}",
                    "user_id": r.user_id,
                    "period_start": r.period_start.isoformat() if r.period_start else None,
                    "period_end": r.period_end.isoformat() if r.period_end else None,
                    "total_income": r.total_income,
                    "total_expenses": r.total_expenses,
                    "status": r.status,
                    "filename": (r.data or {}).get("filename"),
                    "kind": (r.data or {}).get("kind"),
                    "size_bytes": (r.data or {}).get("size_bytes"),
                    "saved": r.status == "final",
                    "saved_count": len((r.data or {}).get("transactions", [])),
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]}

    @router.get("/{statement_id}")
    async def get_statement(statement_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            stmt_id_int = int(statement_id.replace("stmt_", "")) if statement_id.startswith("stmt_") else int(statement_id)
            result = await session.execute(
                select(Statement).where(
                    Statement.id == stmt_id_int,
                    Statement.user_id == user["user_id"],
                )
            )
            rec = result.scalar_one_or_none()
            if not rec:
                raise HTTPException(404, "Not found")
            return {
                "id": f"stmt_{rec.id}",
                "user_id": rec.user_id,
                "total_income": rec.total_income,
                "total_expenses": rec.total_expenses,
                "currency": rec.currency,
                "status": rec.status,
                "transactions": (rec.data or {}).get("transactions", []),
                "created_at": rec.created_at.isoformat() if rec.created_at else None,
            }

    @router.post("/{statement_id}/save")
    async def save_all(statement_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            stmt_id_int = int(statement_id.replace("stmt_", "")) if statement_id.startswith("stmt_") else int(statement_id)
            result = await session.execute(
                select(Statement).where(
                    Statement.id == stmt_id_int,
                    Statement.user_id == user["user_id"],
                )
            )
            rec = result.scalar_one_or_none()
            if not rec:
                raise HTTPException(404, "Not found")
            if rec.status != "draft":
                raise HTTPException(400, "Already saved")

            now = datetime.now(timezone.utc)
            txs_data = (rec.data or {}).get("transactions", [])
            if not rec.account_id:
                raise HTTPException(400, "Statement has no target account — assign one before saving")
            docs = []
            for t in txs_data:
                tx = Transaction(
                    transaction_id=f"tx_{uuid.uuid4().hex[:12]}",
                    user_id=user["user_id"],
                    amount=float(t["amount"]),
                    currency=rec.currency,
                    description=t["description"],
                    merchant_name=t.get("merchant"),
                    category=t.get("category", "uncategorized"),
                    account_id=t.get("account_id") or rec.account_id,
                    date=datetime.fromisoformat(t["date"]) if t.get("date") else now,
                    source="statement",
                    approval_status="unapproved",
                    category_approval_status="unapproved",
                    ai_selected_category=t.get("category", "uncategorized"),
                    ai_confidence=0.7 if t.get("category") != "uncategorized" else 0,
                    ai_reason="Suggested during statement import review.",
                    ai_suggested_categories={
                        "suggestions": [
                            {
                                "category": t.get("category", "uncategorized"),
                                "confidence": 0.7 if t.get("category") != "uncategorized" else 0,
                                "reason": "Suggested during statement import review.",
                                "source": "ai",
                            },
                            {
                                "category": "miscellaneous",
                                "confidence": 0.2,
                                "reason": "Fallback option.",
                                "source": "fallback",
                            },
                            {
                                "category": "uncategorized",
                                "confidence": 0,
                                "reason": "Review manually.",
                                "source": "fallback",
                            },
                        ]
                    },
                )
                session.add(tx)
                docs.append({
                    "transaction_id": tx.transaction_id,
                    "user_id": user["user_id"],
                    "amount": float(t["amount"]),
                    "category": t.get("category", "uncategorized"),
                    "description": t["description"],
                    "is_income": float(t["amount"]) > 0,
                    "approval_status": "unapproved",
                })
            rec.status = "final"
            await session.commit()
            accrued_count = 0
            for d in docs:
                a = await maaser_mod.maybe_accrue(session, user["user_id"], d)
                if a:
                    accrued_count += 1
            return {"ok": True, "saved_count": len(docs), "maaser_accrued_count": accrued_count}

    @router.delete("/{statement_id}")
    async def delete_statement(statement_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            stmt_id_int = int(statement_id.replace("stmt_", "")) if statement_id.startswith("stmt_") else int(statement_id)
            result = await session.execute(
                select(Statement).where(
                    Statement.id == stmt_id_int,
                    Statement.user_id == user["user_id"],
                )
            )
            rec = result.scalar_one_or_none()
            if not rec:
                raise HTTPException(404, "Not found")
            await session.delete(rec)
            await session.commit()
            return {"ok": True}

    return router
