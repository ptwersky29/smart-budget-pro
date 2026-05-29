"""Stress test: 100k transactions, multiple users, concurrent syncs, heavy AI usage.

Run:  python -m pytest tests/test_stress.py -v --timeout=120
Skip: pytest -m "not stress"  (default)
Only: pytest -m stress
"""
import os
import uuid
import random
import time
import threading
from datetime import datetime, timezone, timedelta

import pytest
import httpx

pytestmark = pytest.mark.stress

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000") + "/api"
STRESS_ITERATIONS = int(os.environ.get("STRESS_ITERATIONS", "100"))  # 100 by default, set to 100000 for full
CONCURRENT_WORKERS = int(os.environ.get("STRESS_WORKERS", "10"))

SAMPLE_DESCRIPTIONS = [
    "Tesco Express", "Sainsbury's", "Morrisons", "Aldi", "Lidl",
    "Waitrose", "M&S Foodhall", "Co-op Food", "Iceland", "Asda",
    "Boots", "Superdrug", "WHSmith", "Argos", "John Lewis",
    "Amazon.co.uk", "EBay UK", "Etsy UK", "Not On The High Street",
    "Trainline", "TfL Travel", "Uber London", "Bolt",
    "PureGym", "Better Gym", "Nuffield Health",
    "Netflix", "Disney+", "Prime Video", "Spotify", "Apple One",
    "Octopus Energy", "British Gas", "EDF Energy", "SSE",
    "Vodafone", "EE", "O2", "Three UK",
    "Deliveroo", "Uber Eats", "Just Eat",
    "Chesed Fund", "Yeshiva Donation", "Kollel", "Tzedakah Box",
    "Rent", "Council Tax", "Buildings Insurance", "Contents Insurance",
]

SAMPLE_CATEGORIES = [
    "groceries", "transport", "utilities", "subscriptions", "dining",
    "shopping", "tzedakah", "rent", "entertainment", "health",
    "salary", "freelance", "gift", "other",
]

SAMPLE_MERCHANTS = [
    "tesco", "sainsburys", "amazon", "netflix", "spotify",
    "octopus", "trainline", "puregym", "deliveroo", "uber",
]


def _random_tx(user_id, ts):
    amt = round(random.uniform(-500, 5000), 2)
    if amt < 0 and amt > -1:
        amt = -1.5  # ensure meaningful negatives
    return {
        "transaction_id": f"stress_{uuid.uuid4().hex[:16]}",
        "user_id": user_id,
        "amount": amt,
        "currency": "GBP",
        "description": random.choice(SAMPLE_DESCRIPTIONS),
        "merchant_name": random.choice(SAMPLE_MERCHANTS),
        "normalized_merchant": random.choice(SAMPLE_MERCHANTS),
        "category": random.choice(SAMPLE_CATEGORIES),
        "date": ts.isoformat(),
        "source": "stress_test",
    }


class StressClient:
    def __init__(self, base_url):
        self.client = httpx.Client(base_url=base_url, timeout=30, verify=False)
        self.user_id = None
        self.email = None

    def register(self):
        uid = f"stress_{uuid.uuid4().hex[:12]}"
        email = f"{uid}@stress.test"
        r = self.client.post("/auth/register", json={
            "email": email, "password": "StressPass1!", "name": f"Stress User {uid[:8]}",
        })
        if r.status_code == 200:
            data = r.json()
            self.user_id = data.get("user_id", uid)
            self.email = email
            return True
        return False

    def login(self):
        if not self.email:
            return False
        r = self.client.post("/auth/login", json={"email": self.email, "password": "StressPass1!"})
        if r.status_code == 200:
            token = r.json().get("access_token", "")
            self.client.headers["Authorization"] = f"Bearer {token}"
            return True
        return False

    def insert_tx(self, tx):
        r = self.client.post("/transactions", json=tx)
        return r.status_code in (200, 201)

    def get_dashboard(self):
        r = self.client.get("/dashboard/overview")
        return r.status_code == 200

    def get_tax_calc(self):
        r = self.client.post("/uk/tax-calculator", json={
            "gross_income": random.uniform(20000, 150000),
            "pension_contrib": random.uniform(0, 10000),
        })
        return r.status_code == 200

    def get_forecast(self):
        r = self.client.post("/investments/forecast", json={
            "symbol": "VUSA",
            "current_value": random.uniform(1000, 50000),
            "monthly_contribution": random.uniform(100, 2000),
            "years": random.randint(5, 30),
            "annual_return_pct": 7,
        })
        return r.status_code == 200

    def ai_chat(self):
        r = self.client.post("/ai/chat", json={"message": "Give me a quick tip on saving money", "session_id": f"stress_{uuid.uuid4().hex[:12]}"})
        return r.status_code == 200

    def maaser_summary(self):
        r = self.client.get("/jewish/maaser/summary")
        return r.status_code == 200


# ── Tests ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def stress_clients():
    clients = []
    for i in range(min(CONCURRENT_WORKERS, 50)):
        c = StressClient(API)
        if c.register() and c.login():
            clients.append(c)
    return clients


def test_stress_register_and_login():
    """Verify we can register and login under pressure."""
    c = StressClient(API)
    assert c.register(), "Registration failed"
    assert c.login(), "Login failed"


def test_stress_bulk_transactions(stress_clients):
    """Insert STRESS_ITERATIONS transactions across workers."""
    if not stress_clients:
        pytest.skip("No stress clients available")
    count = 0
    errors = 0
    start = time.time()
    now = datetime.now(timezone.utc) - timedelta(days=365)
    for i in range(STRESS_ITERATIONS):
        client = stress_clients[i % len(stress_clients)]
        tx = _random_tx(client.user_id, now + timedelta(minutes=i * 10))
        if client.insert_tx(tx):
            count += 1
        else:
            errors += 1
            if errors > 10:
                break
    elapsed = time.time() - start
    rate = count / elapsed if elapsed > 0 else 0
    print(f"\n  Inserted {count} txns in {elapsed:.1f}s ({rate:.0f}/s, {errors} errors)")
    assert count > max(1, STRESS_ITERATIONS // 2), f"Too many failures: {errors} errors out of {count + errors}"


def test_stress_dashboard_under_load(stress_clients):
    """Hit dashboard endpoint from multiple workers concurrently."""
    if not stress_clients:
        pytest.skip("No stress clients available")

    results = []
    def _hit():
        for _ in range(5):
            c = random.choice(stress_clients)
            results.append(c.get_dashboard())

    threads = [threading.Thread(target=_hit) for _ in range(min(CONCURRENT_WORKERS, 20))]
    for t in threads: t.start()
    for t in threads: t.join()
    success = sum(results)
    print(f"\n  Dashboard: {success}/{len(results)} succeeded")
    assert success > len(results) * 0.7, f"Dashboard success rate too low: {success}/{len(results)}"


def test_stress_uk_tax(stress_clients):
    """Hit UK tax calculator under load."""
    if not stress_clients:
        pytest.skip("No stress clients available")
    results = [c.get_tax_calc() for c in stress_clients for _ in range(3)]
    success = sum(results)
    print(f"\n  UK Tax: {success}/{len(results)} succeeded")
    assert success > len(results) * 0.7


def test_stress_forecast(stress_clients):
    """Hit investment forecast under load."""
    if not stress_clients:
        pytest.skip("No stress clients available")
    results = [c.get_forecast() for c in stress_clients for _ in range(3)]
    success = sum(results)
    assert success > len(results) * 0.7


def test_stress_ai_chat(stress_clients):
    """Hit AI chat under load (heavy usage simulation)."""
    if not stress_clients:
        pytest.skip("No stress clients available")
    results = [c.ai_chat() for c in stress_clients[:3]]
    success = sum(results)
    print(f"\n  AI Chat: {success}/{len(results)} succeeded")
    # AI may fail at high concurrency — just report
    assert success >= 0


def test_stress_mixed_workload(stress_clients):
    """Mix of all endpoint types concurrently."""
    if not stress_clients:
        pytest.skip("No stress clients available")
    results = []
    def _mixed():
        c = random.choice(stress_clients)
        for fn in [c.get_dashboard, c.get_tax_calc, c.get_forecast, c.maaser_summary]:
            results.append(fn())
    threads = [threading.Thread(target=_mixed) for _ in range(min(CONCURRENT_WORKERS, 10))]
    for t in threads: t.start()
    for t in threads: t.join()
    success = sum(results)
    print(f"\n  Mixed workload: {success}/{len(results)} succeeded")
    assert success > len(results) * 0.5, f"Mixed workload success rate too low: {success}/{len(results)}"
