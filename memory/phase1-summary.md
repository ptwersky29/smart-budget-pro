# Phase 1: Project Mapping & Structure Review

## 1. ARCHITECTURE OVERVIEW

### Stack
- **Backend**: Python 3.11/3.12, FastAPI, SQLAlchemy 2.0 async, PostgreSQL (Neon) / SQLite fallback
- **Frontend**: React 18, React Router v7, TailwindCSS 3, shadcn/ui (Radix primitives), Recharts, Axios
- **Deployment**: Backend on Render, Frontend on Vercel, optional Docker

### Project Layout
```
smart-budget-pro-main/
├── backend/           # 41 .py files, FastAPI app
│   ├── server.py      # Main app: middleware stack + 28 sub-routers
│   ├── db.py          # 44+ ORM models, engine, session
│   ├── auth.py        # JWT auth, OAuth, roles (883 lines)
│   ├── finance_engine.py  # Core: transactions, budgets, analytics (2822 lines)
│   ├── budget_system.py   # Budget system: day-to-day, AI classify (2348 lines)
│   ├── truelayer.py       # Open Banking OAuth + sync
│   ├── sms.py             # Twilio SMS automation
│   └── ... 30+ more modules
├── frontend/
│   └── src/
│       ├── pages/         # 28 pages (lazy loaded)
│       ├── components/    # 24 main + ~55 UI components
│       ├── widgets/       # 12 dashboard widgets
│       ├── contexts/      # 2 providers (Auth, Settings)
│       ├── hooks/         # 5 custom hooks
│       ├── lib/           # 5 lib modules (api, storage, cache, utils, undo)
│       └── data/          # 5 data files (navigation, constants, defaults, bankLogos)
└── tests/                 # Backend tests (root) + backend/tests/
```

---

## 2. BACKEND MODULE MAP

### Router-bearing modules (28 total)

| Module | Router Prefix | Tags | # Route Methods | Key Dependencies |
|--------|--------------|------|----------------|------------------|
| `auth` | `/auth` | auth | 18 | db, security, httpx (Google) |
| `finance_engine` | (none) | finance | ~30 | db, llm, maaser, statements, cache |
| `budget_system` | `/budget-system` | budget-system | ~35 | db, llm, statements |
| `truelayer` | `/truelayer` | truelayer | ~8 | db, app_config, bank_sync_utils |
| `ai_service` | `/ai` | ai | 7 | db, llm |
| `ai_insights` | `/ai/insights` | ai-insights | 5 | db, llm |
| `billing` | (none) | billing | 8 | db, stripe |
| `admin` | `/admin` | admin | 9 | db, audit |
| `jewish` | `/jewish` | jewish | ~12 | db, maaser |
| `jewish_reports` | `/jewish/reports` | jewish-reports | 2 | db, maaser |
| `sms` | (none) | sms | 9 | db, app_config, llm |
| `statements` | `/statements` | statements | 5 | db, maaser, llm |
| `reports` | `/reports` | reports | 4 | db (require_premium) |
| `app_settings` | `/settings` | settings | 3 | db |
| `prices` (x2) | `/prices` + `/prices/stocks` | prices | 6 | httpx (CoinGecko, Yahoo) |
| `manual_accounts` | `/accounts/manual` | manual | 5 | db |
| `notifications` | `/notifications` | notifications | 4 | db |
| `empty_states` | `/empty-states` | empty_states | 3 | db |
| `onboarding` | `/onboarding` | onboarding | 3 | db, audit |
| `investments` | `/investments` | investments | 9 | db |
| `analytics` | `/analytics` | analytics | 4 | db |
| `support` | `/support` | support | 5 | db, audit |
| `uk_tools` | `/uk` | uk | 2 | none (pure computation) |
| `app_config` | `/admin` | admin | 2 | db |
| `gdpr` | `/gdpr` | gdpr | 3 | db, audit |
| `tyl` | (none) | tyl-billing | 3 | db |
| `hebcal` | `/jewish/hebcal` | jewish | 4 | astral, pyluach |
| `integrations` | `/integrations` | integrations | 0 | **empty router — no routes** |

### Non-router utility modules (13 total)

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `db.py` | ORM models, engine, session | 44+ model classes, `init_engine`, `create_tables` |
| `llm.py` | OpenRouter LLM client | `call_llm`, `track_ai_usage`, `parse_json`, `MODEL_COSTS` |
| `maaser.py` | Auto-maaser accrual on income | `maybe_accrue`, `backfill_for_user`, `INCOME_CATEGORIES` |
| `security.py` | Encryption, password validation, CSRF | `encrypt_value`, `validate_password`, `generate_csrf_token` |
| `middleware.py` | ASGI middleware | 4 middleware classes + URL helpers |
| `rate_limit.py` | Rate limiter + CSRF protection | `RateLimiter`, `RateLimitMiddleware`, `CsrfProtectionMiddleware` |
| `cache.py` | In-memory TTL cache | `TTLCache`, `market_cache`, `audit_cache` |
| `audit.py` | Audit logging | `log_action` |
| `bank_sync_utils.py` | TrueLayer helpers | `parse_import_from_date`, `is_reauth_error`, `transaction_sync_id` |
| `exceptions.py` | Base exception | `FinanceAIError` |
| `migrate.py` | One-shot table creation | CLI script |
| `migrate_budget_event_group.py` | Budget migration | CLI script |
| `server.py` | App entry point | FastAPI app, startup/shutdown, middleware, CORS |

### External Integrations (7)

| Service | Module | Auth Method |
|---------|--------|-------------|
| OpenRouter (LLM) | `llm.py`, used by 6 modules | API key (`OPENROUTER_API_KEY`) |
| Stripe | `billing.py` | API key (`STRIPE_API_KEY`) |
| TrueLayer | `truelayer.py` | OAuth2 client credentials |
| Twilio | `sms.py` | Account SID + Auth Token |
| CoinGecko | `prices.py` | Keyless (free tier) |
| Yahoo Finance | `prices.py` | Keyless |
| Google OAuth | `auth.py` | OAuth2 (`GOOGLE_CLIENT_ID`/`SECRET`) |
| Sentry | `server.py` | DSN (`SENTRY_DSN`) |
| Tyl by NatWest | `tyl.py` | HMAC shared secret |

---

## 3. FRONTEND STRUCTURE MAP

### Route Table (28 pages)

| Path | Component | Auth | Key Backend Endpoints Called |
|------|-----------|------|------------------------------|
| `/` | Landing | No | none |
| `/login` | Login | No | `POST /auth/login`, `GET /auth/google` |
| `/register` | Register | No | `POST /auth/register` |
| `/forgot-password` | ForgotPassword | No | `POST /auth/forgot-password` |
| `/reset-password` | ResetPassword | No | `POST /auth/reset-password` |
| `/pricing` | Pricing | No | `GET /billing/packages` |
| `/privacy` | Privacy | No | none |
| `/billing/success` | PaymentSuccess | No | `GET /billing/status/{session_id}` |
| `/onboarding` | OnboardingWizard | Yes | `GET/PUT /onboarding` |
| `/dashboard` | Dashboard | Yes | `GET /dashboard/overview`, `/budgets`, `/budget-system/alerts`, `/budget-system/upcoming` |
| `/transactions` | Transactions | Yes | `GET/POST/PATCH/DELETE /transactions`, `POST /transactions/ai-search` |
| `/budgets` | BudgetPage | Yes | `GET/POST/PUT/DELETE /budget-system/*` |
| `/subscriptions` | Subscriptions | Yes | `GET/POST/DELETE /subscriptions`, `/transactions/recurring` |
| `/import` | BankStatements | Yes | `POST /statements/upload`, bank connections |
| `/investments` | Investments | Yes | `GET/POST/PUT/DELETE /investments/*` |
| `/connections` | Connections | Yes | `GET/POST/DELETE /truelayer/*`, `/accounts/manual/*` |
| `/integrations` | Integrations | Yes | various |
| `/sms` | SMS | Yes | `GET/POST /sms/*` |
| `/statements` | Statements | Yes | `POST /statements/parse`, `/statements/save` |
| `/accounts/:connectionId` | AccountPage | Yes | `GET /transactions`, `GET /truelayer/accounts/{id}` |
| `/jewish` | Jewish | Yes | `GET/POST /jewish/*`, `/jewish/reports/*` |
| `/uk-tools` | UKTools | Yes | `POST /uk/tax-calc`, `/uk/uc-estimate` |
| `/reports` | Reports | Yes | `POST /reports/*` |
| `/settings` | Settings | Yes | `GET/PUT /settings/app`, etc. |
| `/settings/categories` | CategoryManager | Yes | `GET/POST /categories` |
| `*` | NotFound | No | none |

### Provider Tree
```
BrowserRouter
  └── ThemeProvider (next-themes)
       └── AuthProvider
            ├── SettingsProvider
            │    └── ErrorBoundary
            │         └── Suspense (fallback: PageLoader)
            │              └── AppRouter (useLocation → Routes)
            │                   ├── Public: Landing, Login, Register, ForgotPassword, ResetPassword, Pricing, Privacy
            │                   ├── Semi-public: Onboarding, PaymentSuccess, AuthCallback
            │                   └── Protected (AppLayout + Outlet):
            │                        ├── Dashboard → loads 11 widgets
            │                        ├── Transactions → TransactionForm, TransactionRow, ComparePeriods
            │                        ├── BudgetPage → CategoryCombobox, MonthPicker
            │                        └── ... 14 more authenticated pages
            └── Toaster (sonner)
```

### Component Counts
| Category | Count | Notes |
|----------|-------|-------|
| Pages | 28 | All lazy-loaded |
| Main Components | 24 | ProtectedRoute, ErrorBoundary, TransactionForm, etc. |
| Settings Components | 7 | Appearance, Dashboard, Finance, Automation, Notification, Accessibility, Account |
| UI Components | ~55 | shadcn/ui style, Radix-based |
| Features | 1 | PacingIndicator |
| Widgets | 12 | NetWorthCard, IncomeCard, CashFlowChart, etc. |
| Contexts | 2 | AuthContext, SettingsContext |
| Hooks | 5 | useApiQuery, useKeyboardShortcut, useSwipe, use-toast, |
| Lib | 5 | api, storage, cache, utils, undo |
| Data | 5 | navigation, constants, defaults, bankLogos, index |

---

## 4. CONFIGURATION INVENTORY

### Environment Variables

#### Required (backend)
| Variable | Source | Purpose |
|----------|--------|---------|
| `DATABASE_URL` | `.env`/`.env.local` | PostgreSQL or SQLite connection |
| `JWT_SECRET` | `.env` | JWT signing (64 chars) |
| `FRONTEND_URL` | `.env` | CORS + OAuth redirects |

#### Optional (backend)
| Variable | Purpose | Status |
|----------|---------|--------|
| `OPENROUTER_API_KEY` | AI chat/insights | **EMPTY** |
| `STRIPE_API_KEY` | Payments | Set (test key) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | Set |
| `TRUELAYER_CLIENT_ID` | Bank sync | **NOT SET** |
| `TRUELAYER_CLIENT_SECRET` | Bank sync | **NOT SET** |
| `GOOGLE_CLIENT_ID` | Google OAuth | **EMPTY** |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | **EMPTY** |
| `SENTRY_DSN` | Error monitoring | Not set |

#### Frontend
| Variable | Source | Purpose |
|----------|--------|---------|
| `REACT_APP_BACKEND_URL` | `frontend/.env` | API base URL |

### Deployment Artifacts

| Platform | File | Service | Build | Start |
|----------|------|---------|-------|-------|
| Render | `render.yaml` | `financeai-api` (web) | `pip install -r requirements.txt` | `uvicorn server:app --host 0.0.0.0 --port $PORT --workers 2` |
| Render | `render.yaml` | `financeai-worker` | same | Python inline + sleep loop |
| Render | `render.yaml` | `financeai-db` (PostgreSQL) | - | Starter plan, Frankfurt |
| Vercel | `frontend/vercel.json` | SPA | `npm run build` | output: `build/` |
| Docker | `backend/Dockerfile` | API | `pip install -r requirements.txt` | `uvicorn server:app --host 0.0.0.0 --port 8000` |

### Hardcoded URLs Found
- `https://budget-pro-4jlg.onrender.com` — production backend (hardcoded in `api.js` fallback)
- `https://smart-budget-pro-ewtm.vercel.app` — production frontend (hardcoded in 3 backend files)
- `http://localhost:3000` / `http://127.0.0.1:3000` — local dev
- `https://auth.truelayer-sandbox.com` — TrueLayer sandbox (default)
- `https://openrouter.ai/api/v1/chat/completions` — OpenRouter API
- `https://api.coingecko.com/api/v3/simple/price` — CoinGecko
- `https://query1.finance.yahoo.com/v8/finance/chart/` — Yahoo Finance
- `https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` — Twilio
- `https://accounts.google.com/o/oauth2/v2/auth` — Google OAuth

---

## 5. FULL REQUEST FLOW TRACE

### Example: User opens Dashboard

```
1. User navigates to /dashboard
2. React Router matches "/dashboard" route
3. ProtectedRoute checks AuthContext → user !== null
4. AppLayout renders sidebar + <Outlet>
5. React.lazy loads Dashboard.jsx component
6. Dashboard component mounts
   ├── useEffect → document.title = "Dashboard | FinanceAI"
   ├── useAuth() → gets { user, refresh }
   ├── useSettings() → gets { settings, preferences }
   └── useEffect → loadAll()
        └── loadAll() fires 4 parallel API calls:
             ├── api.get("/dashboard/overview")
             │    └── Axios interceptor:
             │         ├── request: injects "Authorization: Bearer <jwt>"
             │         │           injects "X-CSRF-Token" (on mutations)
             │         └── response: caches GET, invalidates on mutations
             │
             │    └── FastAPI handler (finance_engine.py:2063):
             │         ├── Depends(get_current_user) → decodes JWT
             │         ├── Queries DB: transactions, budgets, recurring
             │         ├── Computes: net worth, income, spending, cash flow
             │         └── Returns JSON overview object
             │
             ├── api.get("/budgets")
             ├── api.get("/budget-system/alerts")
             └── api.get("/budget-system/upcoming")

7. State updates: overview, budgets, alerts, upcoming → React re-renders
8. Widgets render based on dashboardPrefs.widgets order:
   ├── LiveBalanceHero → user balance + accounts
   ├── NetWorthCard → MetricCard from overview
   ├── QuickActionsPanel → static nav links
   ├── CashFlowChart → Recharts AreaChart
   └── ...more widgets

9. Error flow: 401 on any call triggers Axios interceptor:
   ├── _retry = true (prevents infinite loop)
   ├── POST /auth/refresh (via axios directly, bypasses interceptor)
   ├── If refresh succeeds → retries original request
   └── If refresh fails → clearTokens() → redirect /login?expired=1
```

---

## 6. KEY OBSERVATIONS & NOTABLE FINDINGS

### Architecture Strengths
- Clean separation: backend modules are self-contained with `build_router()` pattern
- Consistent lazy-loading on frontend for all pages
- Centralized API client with JWT + CSRF interceptor
- Good use of in-memory cache layer on both sides

### Potential Issues Found
1. **No dashboard.py** — The `/dashboard/overview` route lives in `finance_engine.py` (2822 lines), not a dedicated module
2. **Empty router** — `integrations.py` has a `build_router()` that returns a router with zero routes
3. **Python runtime mismatch** — `runtime.txt` says 3.11, Dockerfile uses 3.12-slim
4. **Secrets in .env** — Admin password, Stripe test keys, and JWT secret are in plaintext in committed files
5. **Hardcoded production URLs** — Present in backend code (`server.py:200`, `middleware.py:14`, `truelayer.py:166`)
6. **Missing env vars** — OPENROUTER_API_KEY, TRUELAYER_CLIENT_ID/SECRET, GOOGLE_CLIENT_ID/SECRET are all unset
7. **No separate dashboard module** — The dashboard endpoint is inside finance_engine.py
8. **Large files** — `finance_engine.py` (2822 lines), `budget_system.py` (2348 lines), `auth.py` (883 lines)
9. **3 test files only** for frontend (Skeleton, EmptyState, ConfirmModal) — very low coverage
10. **20+ endpoint mismatch** — health_check_report found frontend uses endpoints that weren't detected in backend scan (false positive from the scan methodology, but worth verifying)

### Estimated Full API Surface
Approximately **180+ route methods** across all backend modules, serving 28 frontend pages.
