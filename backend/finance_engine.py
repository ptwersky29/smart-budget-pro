"""Smart financial engine: transactions, budgets, analytics, merchant normalization, split, recurring."""

import logging
import math
import re
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import maaser
from auth import get_current_user
from cache import TTLCache
from category_catalog import (
    build_category_payload,
    combine_categories,
    hierarchy_payload,
    humanize_category_name,
    slugify_category_name,
)
from db import (
    AccountNickname,
    BankAccount,
    BankConnection,
    Budget,
    Category,
    CategoryRule,
    RecurringTransaction,
    SplitTransaction,
    Subscription,
    Transaction,
    TransactionTransferPair,
    User,
    get_session_maker,
)
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from llm import call_llm, parse_json, track_ai_usage
from pydantic import BaseModel
from security import sanitize_input
from sqlalchemy import delete, func, or_, select, update
from statements import (
    CATEGORIES,
    CATEGORISE_KEYWORDS,
    CATEGORY_HIERARCHY,
    INCOME_CATEGORIES,
)

logger = logging.getLogger("finance")

_query_cache = TTLCache(ttl=60)  # 60-second cache for frequent queries

# ── Merchant normalization ───────────────────────────────────────────────

MERCHANT_NORMALIZE = {
    "TESCO": "Tesco",
    "TESCO STORES": "Te���q�^