from __future__ import annotations

import re
from typing import Iterable

from statements import (
    CATEGORIES,
    CATEGORY_HIERARCHY,
    INCOME_CATEGORIES,
    SECTION_FOR_CATEGORY,
)

SECTION_COLOURS = {
    "❤️ Charity": "#e11d48",
    "👕 Clothing": "#8b5cf6",
    "🏠 Household": "#f59e0b",
    "🏠 Housing": "#0ea5e9",
    "👦 Kids": "#10b981",
    "🧩 Ungrouped": "#64748b",
    "💰 Income": "#22c55e",
    "Other": "#64748b",
}

CATEGORY_VISUALS = {
    "maaser_tzedakah": {
        "emoji": "🪙",
        "description": "Ten-percent giving and maaser tracking.",
    },
    "charity": {
        "emoji": "🤝",
        "description": "General charitable giving and donations.",
    },
    "other_charity": {
        "emoji": "💝",
        "description": "Community giving, shul and special causes.",
    },
    "clothing_husband": {
        "emoji": "👔",
        "description": "Clothing purchases for husband.",
    },
    "clothing_wife": {"emoji": "👗", "description": "Clothing purchases for wife."},
    "clothing_kids": {
        "emoji": "🧒",
        "description": "Children’s clothing and accessories.",
    },
    "shoes": {"emoji": "👟", "description": "Shoes, trainers and repairs."},
    "fruit_veg": {"emoji": "🥬", "description": "Fresh produce and vegetables."},
    "grocery": {
        "emoji": "🛒",
        "description": "Supermarket and weekly grocery shopping.",
    },
    "bakery": {"emoji": "🥖", "description": "Bakery, challah and bread."},
    "fish": {"emoji": "🐟", "description": "Fish and fishmonger purchases."},
    "meat": {"emoji": "🥩", "description": "Meat and butcher purchases."},
    "paper_goods": {
        "emoji": "🧻",
        "description": "Paper towels, tissues and disposable goods.",
    },
    "takeaway": {"emoji": "🥡", "description": "Takeaway meals and food delivery."},
    "wine": {"emoji": "🍷", "description": "Wine and kiddush drinks."},
    "house_supplies": {
        "emoji": "🧼",
        "description": "Household supplies, cleaning and essentials.",
    },
    "chemist": {
        "emoji": "💊",
        "description": "Pharmacy, chemist and wellness essentials.",
    },
    "rent_mortgage": {
        "emoji": "🏡",
        "description": "Rent, mortgage and core housing payments.",
    },
    "electricity": {"emoji": "⚡", "description": "Electricity bills and top-ups."},
    "heating": {"emoji": "🔥", "description": "Heating costs and boiler fuel."},
    "gas": {"emoji": "🫧", "description": "Gas utility bills."},
    "water": {"emoji": "💧", "description": "Water bills and related charges."},
    "council_tax": {
        "emoji": "🏛️",
        "description": "Council tax and local authority charges.",
    },
    "telephone": {"emoji": "☎️", "description": "Landline and home phone bills."},
    "mobile": {"emoji": "📱", "description": "Mobile phone plans and usage."},
    "cleaning_help": {
        "emoji": "🧹",
        "description": "Cleaning help and domestic support.",
    },
    "life_insurance": {"emoji": "🛡️", "description": "Life insurance premiums."},
    "buildings_insurance": {
        "emoji": "🏠",
        "description": "Home and contents insurance.",
    },
    "school_fees": {"emoji": "🎓", "description": "School fees and tuition payments."},
    "bus_fee": {"emoji": "🚌", "description": "School bus fees and transport."},
    "babysitting": {"emoji": "🧸", "description": "Babysitting and childcare support."},
    "nappies": {"emoji": "🍼", "description": "Nappies, wipes and infant essentials."},
    "trust_savings": {"emoji": "🏦", "description": "Savings and trust contributions."},
    "toys": {"emoji": "🪀", "description": "Toys, games and children’s treats."},
    "tutor": {"emoji": "📚", "description": "Tutoring and academic support."},
    "therapy": {
        "emoji": "🫶",
        "description": "Therapy, emotional and specialist support.",
    },
    "medical": {"emoji": "🩺", "description": "Medical treatment and prescriptions."},
    "public_transport": {
        "emoji": "🚇",
        "description": "Public transport and rail travel.",
    },
    "car_lease": {"emoji": "🚗", "description": "Car lease and financing."},
    "petrol_diesel": {
        "emoji": "⛽",
        "description": "Fuel and petrol station spending.",
    },
    "dart_charge": {
        "emoji": "🛣️",
        "description": "Road charges, congestion and tunnel fees.",
    },
    "tolls": {"emoji": "🚧", "description": "Tolls and crossing fees."},
    "tickets": {"emoji": "🎫", "description": "Parking fines and ticket costs."},
    "loan_payoff": {"emoji": "💳", "description": "Loan repayments and debt payoff."},
    "interest": {"emoji": "📈", "description": "Interest charges and finance fees."},
    "investments": {
        "emoji": "📊",
        "description": "Investments and longer-term allocations.",
    },
    "petty_cash": {"emoji": "💵", "description": "Cash withdrawals and petty cash."},
    "miscellaneous": {"emoji": "🏷️", "description": "General uncategorised spend."},
    "taxi": {"emoji": "🚕", "description": "Taxi and ride-hailing journeys."},
    "mikva": {"emoji": "🕯️", "description": "Mikva and related Jewish life costs."},
    "taxes": {
        "emoji": "🧾",
        "description": "Tax payments, HMRC and statutory charges.",
    },
    "upcoming_savings": {
        "emoji": "📦",
        "description": "Sinking funds for upcoming expenses.",
    },
    "salary": {"emoji": "💼", "description": "Salary and payroll income."},
    "income": {"emoji": "💷", "description": "Other money in and general income."},
    "uncategorized": {
        "emoji": "🗂️",
        "description": "Transactions waiting for a better category.",
    },
}

LABELS = {name: label for items in CATEGORY_HIERARCHY.values() for name, label in items}


def slugify_category_name(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9\s_\-]", "", value)
    value = re.sub(r"[\s\-]+", "_", value)
    value = re.sub(r"_+", "_", value)
    return value.strip("_")


def humanize_category_name(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return "Uncategorized"
    return value.replace("_", " ").replace("-", " ").title()


def _section_parts(section_title: str | None) -> tuple[str, str]:
    section = (section_title or "Other").strip()
    parts = section.split(" ", 1)
    if len(parts) == 2 and any(not ch.isalnum() for ch in parts[0]):
        return parts[0], parts[1].strip() or section
    return "", section


def _section_key(section_title: str | None) -> str:
    _, label = _section_parts(section_title)
    return slugify_category_name(label or "other") or "other"


def system_category_defaults(name: str) -> dict:
    section = SECTION_FOR_CATEGORY.get(name, "Other")
    section_emoji, section_label = _section_parts(section)
    visual = CATEGORY_VISUALS.get(name, {})
    colour = visual.get("color") or SECTION_COLOURS.get(section, "#64748b")
    emoji = visual.get("emoji") or section_emoji or "🏷️"
    label = LABELS.get(name) or humanize_category_name(name)
    return {
        "name": name,
        "slug": name,
        "label": label,
        "emoji": emoji,
        "icon": emoji,
        "color": colour,
        "description": visual.get("description") or f"Track {label.lower()} spending.",
        "section": section,
        "section_key": _section_key(section),
        "section_label": section_label,
        "section_emoji": section_emoji or "🏷️",
        "is_income": name in INCOME_CATEGORIES,
        "is_default": name in CATEGORIES,
    }


def custom_category_defaults(
    name: str,
    label: str | None = None,
    section: str | None = None,
    is_income: bool = False,
) -> dict:
    resolved_section = section or ("💰 Income" if is_income else "🧩 Ungrouped")
    section_emoji, section_label = _section_parts(resolved_section)
    return {
        "name": name,
        "slug": name,
        "label": label or humanize_category_name(name),
        "emoji": "💠" if not is_income else "💷",
        "icon": "💠" if not is_income else "💷",
        "color": SECTION_COLOURS.get(
            resolved_section, "#7c3aed" if not is_income else "#22c55e"
        ),
        "description": None,
        "section": resolved_section,
        "section_key": _section_key(resolved_section),
        "section_label": section_label,
        "section_emoji": section_emoji or "🏷️",
        "is_income": is_income,
        "is_default": False,
    }


def build_category_payload(name: str, row=None, usage: dict | None = None) -> dict:
    base = (
        system_category_defaults(name)
        if name in CATEGORIES
        else custom_category_defaults(
            name,
            label=getattr(row, "label", None),
            section=getattr(row, "section", None),
            is_income=bool(getattr(row, "is_income", False)),
        )
    )
    payload = {
        **base,
        "category_id": getattr(row, "category_id", None)
        or (f"system:{name}" if name in CATEGORIES else f"custom:{name}"),
        "label": getattr(row, "label", None) or base["label"],
        "emoji": getattr(row, "icon", None) or base["emoji"],
        "icon": getattr(row, "icon", None) or base["emoji"],
        "color": getattr(row, "color", None) or base["color"],
        "description": getattr(row, "description", None) or base["description"],
        "section": getattr(row, "section", None) or base["section"],
        "is_income": getattr(row, "is_income", base["is_income"]),
        "budget": float(getattr(row, "budget", 0))
        if getattr(row, "budget", None) is not None
        else None,
        "sort_order": getattr(row, "sort_order", 0),
        "is_archived": bool(getattr(row, "is_archived", False)),
        "source": "System" if name in CATEGORIES else "Custom",
        "display_name": getattr(row, "label", None) or base["label"],
        "usage": usage
        or {
            "transactions": 0,
            "budgets": 0,
            "recurring": 0,
            "subscriptions": 0,
            "rules": 0,
            "total": 0,
        },
    }
    section_emoji, section_label = _section_parts(payload["section"])
    payload["section_key"] = _section_key(payload["section"])
    payload["section_label"] = section_label
    payload["section_emoji"] = section_emoji or payload["emoji"]
    payload["can_delete"] = payload["name"] != "uncategorized"
    return payload


def combine_categories(rows: Iterable, usage_map: dict | None = None) -> list[dict]:
    usage_map = usage_map or {}
    rows = list(rows)
    archived_names = {row.name for row in rows if getattr(row, "is_archived", False)}
    active_rows = {
        row.name: row for row in rows if not getattr(row, "is_archived", False)
    }
    combined = []
    included_names = set()

    for name in CATEGORIES:
        if name in archived_names:
            continue
        combined.append(
            build_category_payload(name, active_rows.get(name), usage_map.get(name))
        )
        included_names.add(name)

    for row in rows:
        if getattr(row, "is_archived", False):
            continue
        if row.name in CATEGORIES:
            continue
        combined.append(build_category_payload(row.name, row, usage_map.get(row.name)))
        included_names.add(row.name)

    for name in sorted(usage_map):
        if not name or name in archived_names or name in included_names:
            continue
        combined.append(build_category_payload(name, None, usage_map.get(name)))

    combined.sort(
        key=lambda c: (
            c.get("sort_order", 0),
            c.get("section_key", "other"),
            c.get("label", c["name"]),
        )
    )
    return combined


def hierarchy_payload(categories: Iterable[dict]) -> dict:
    grouped: dict[str, list[str]] = {}
    for category in categories:
        section = category.get("section") or "Other"
        grouped.setdefault(section, []).append(category["name"])
    for section in grouped:
        grouped[section] = sorted(
            grouped[section],
            key=lambda name: LABELS.get(name) or humanize_category_name(name),
        )
    return grouped
