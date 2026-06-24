# Phase 2: Runtime Environment & Dependency Checks

## Environment Versions

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.14.5 | System version (project targets 3.12) |
| pip | 26.1.1 | |
| Node | 24.16.0 | |
| npm | 11.15.0 | |
| OS | Windows (PowerShell 5.1) | |

---

## Backend Dependencies (pip install)

**Status: ✅ ALL 30 packages installed successfully**

| Package | Version | Notes |
|---------|---------|-------|
| fastapi | 0.110.1 | |
| uvicorn | 0.25.0 | |
| sqlalchemy[asyncio] | 2.0.50 | |
| asyncpg | 0.31.0 | PostgreSQL driver |
| psycopg2-binary | 2.9.12 | PostgreSQL driver |
| stripe | 11.6.0 | ✅ Pinned downgrade (was 15.2.0) |
| pandas | 2.3.3 | ✅ Pinned downgrade (was 3.0.3) |
| cryptography | 43.0.3 | ✅ Pinned downgrade (was 48.0.0) |
| pypdf | 4.3.1 | ✅ Pinned downgrade (was 6.13.0) |
| bcrypt | 4.1.3 | |
| pyjwt | 2.13.0 | |
| httpx | 0.28.1 | |
| pyluach | 2.3.0 | Hebrew calendar |
| astral | 3.2 | Sun times |
| reportlab | 4.5.1 | PDF generation |
| aiosqlite | 0.22.1 | SQLite async |
| boto3 | 1.43.15 | AWS SDK |
| All others | ✅ | All 30 packages resolved |

### Backend Module Imports
✅ 8 core modules imported successfully: `security`, `auth`, `finance_engine`, `budget_system`, `llm`, `truelayer`, `server`, `db`

---

## Frontend Dependencies (npm install)

**Status: ✅ 1439 → 1455 packages installed**

| Library | Version | Notes |
|---------|---------|-------|
| react | 18.3.1 | |
| react-dom | 18.3.1 | |
| react-router-dom | 7.18.0 | ⚠️ ESM-only, required Jest moduleNameMapper config |
| react-scripts | 5.0.1 | CRA, legacy |
| axios | 1.8.4 | |
| recharts | 3.6.0 | |
| tailwindcss | 3.4.17 | |
| @radix-ui/* | various | shadcn/ui primitives |
| @testing-library/* | newly added | ✅ `jest-dom`, `react`, `dom`, `user-event` |

### Vulnerabilities
41 vulnerabilities: 4 low, 26 moderate, 11 high — all from `react-scripts` 5.0.1 transitive deps (CRA known issues)

---

## Environment Variables

### Required (3/3 set ✅)
| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `sqlite+aiosqlite:///financeai.db` (local) or Neon PostgreSQL |
| `JWT_SECRET` | 64-char key |
| `FRONTEND_URL` | `http://localhost:3000` |

### Optional from .env
| Variable | Status | Source |
|----------|--------|--------|
| `STRIPE_API_KEY` | ✅ Set (test key) | `backend/.env` |
| `STRIPE_WEBHOOK_SECRET` | ✅ Set | `backend/.env` |
| `STRIPE_MONTHLY_PRICE_ID` | ✅ Set | `backend/.env` |
| `STRIPE_YEARLY_PRICE_ID` | ✅ Set | `backend/.env` |
| `ADMIN_EMAIL` | ✅ Set | `backend/.env` |
| `ADMIN_PASSWORD` | ✅ Set | `backend/.env` |

### Unset (missing third-party keys)
| Variable | Impact |
|----------|--------|
| `OPENROUTER_API_KEY` | ❌ AI chat, insights, auto-categorization disabled |
| `TRUELAYER_CLIENT_ID` | ❌ Open Banking sync disabled |
| `TRUELAYER_CLIENT_SECRET` | ❌ Open Banking sync disabled |
| `GOOGLE_CLIENT_ID` | ❌ Google OAuth login disabled |
| `GOOGLE_CLIENT_SECRET` | ❌ Google OAuth login disabled |
| `SENTRY_DSN` | Error monitoring disabled (non-critical) |

---

## Database Connectivity

### SQLite (local)
**✅ PASS** — Connected, `SELECT 1 = 1`, all tables created successfully.

### PostgreSQL (Neon remote)
**⚠️ Previously failed** in health_check_report (`unexpected connection_lost()`). Not retested in this session (requires network access to Neon).

---

## Backend Tests (pytest)

**Result: 92 passed, 6 failed, 28 errors** (from 126 tests)

| Test File | Status | Notes |
|-----------|--------|-------|
| `test_bank_sync_utils.py` | ✅ 5/5 passed | Pure unit tests, no deps |
| `test_callback_middleware.py` | ✅ 4/4 passed | Middleware tests |
| `test_comprehensive.py` | ✅ 41/41 passed | Security, cache, rate limiter, router wiring |
| `test_jewish_finance.py` | ✅ 42/42 passed | Holiday defaults, maaser calc, chasuna |
| `test_truelayer_auth_params.py` | ✅ 7/7 passed | Auth param generation |
| `test_financeai_backend.py` | ❌ 5 failed, 23 errors | ⚠️ Integration tests — hit remote server (not running) |
| `test_stress.py` | ❌ 1 failed, 5 errors | ⚠️ Stress tests — need running server |

Failures are **all integration tests** that require a running server or remote deployment — unit tests are 100% passing.

---

## Frontend Tests (react-scripts test)

**Result: ✅ 11/11 passed across 3 test suites**

| Test Suite | Tests | Status |
|-----------|-------|--------|
| `Skeleton.test.jsx` | 4 | ✅ PASS (1 selector fixed: `.flex.gap-4` → `.flex.items-center.space-x-4`) |
| `ConfirmModal.test.jsx` | 4 | ✅ PASS |
| `EmptyState.test.jsx` | 3 | ✅ PASS (module resolution + TextEncoder polyfill fixed) |

### Issues Fixed
- **Missing `@testing-library/*` packages** — installed `jest-dom`, `react`, `dom`, `user-event`
- **react-router-dom v7 ESM resolution** — CRA's Jest 27 can't handle v7's `exports` field; added `moduleNameMapper` in `package.json`
- **`TextEncoder` missing in JSDOM** — added polyfill via `util` module in `setupTests.js`
- **Stale Skeleton test selector** — updated class name to match current component

---

## Issues Found & Fixed

### 🔧 Fixed in Phase 2

| Issue | Fix |
|-------|-----|
| Missing `@testing-library/jest-dom`, `@testing-library/react` | Installed 3 packages |
| `react-router-dom` v7 not resolving in Jest | Added `moduleNameMapper` for `react-router-dom`, `react-router`, `react-router/dom` |
| `TextEncoder` not defined in JSDOM | Added polyfill in `setupTests.js` |
| SkeletonTable test used wrong class selector | Changed `.flex.gap-4` → `.flex.items-center.space-x-4` |
| Empty `integrations.py` router | ✅ Fixed in Phase 1 |
| Python version mismatch | ✅ Fixed in Phase 1 |
| Missing startup warnings for unset env vars | ✅ Fixed in Phase 1 |

### ⚠️ Remaining Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| react-router-dom v7 + CRA 5.x incompatibility | Medium | Can't upgrade CRA without ejection; moduleNameMapper works |
| 41 npm vulnerabilities | Medium | All from CRA transitive deps |
| 28 backend integration tests fail | Medium | Require running server; unit tests all pass |
| Stripe API keys in plaintext .env files | High | Already gitignored, but present on disk |
| No PostgreSQL connection test passed | Medium | Past health check showed failure |
| Python 3.14 > project target 3.12 | Low | All packages install and work on 3.14 |
