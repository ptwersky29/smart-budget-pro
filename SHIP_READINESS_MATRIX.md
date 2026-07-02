# Ship Readiness Matrix

## Frontend Pages
| Area | Routes | Required checks |
| --- | --- | --- |
| Public | `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/pricing`, `/privacy`, `/callback`, `/billing/success`, `*` | load, validation, OAuth/callback failure, keyboard focus, mobile layout |
| Onboarding | `/onboarding` | protected redirect, progress save/skip, refresh/back behavior |
| Core dashboard | `/dashboard` | overview data, skeleton, empty state, refresh, notifications, command palette |
| Money movement | `/accounts`, `/accounts/:accountId`, `/accounts/legacy/:connectionId`, `/transactions`, `/budgets`, `/subscriptions` | CRUD, invalid input, bulk actions, modals, optimistic updates, empty states |
| Planning/reporting | `/reports`, `/investments`, `/jewish`, `/uk-tools`, `/statements`, `/sms` | calculators, uploads, exports, mocked external failures, mobile tables |
| Connections/settings | `/connections`, `/integrations`, `/settings`, `/settings/categories` | provider config, category management, preferences persistence, logout |
| Admin | `/admin` | admin-only guard, user/flag actions, non-admin redirect |

## Backend Endpoint Groups
| Router group | Required checks |
| --- | --- |
| Auth/session | register, login, refresh, logout, me, sessions, password reset/change, email verification, OAuth config/callback errors |
| Finance core | transactions, bulk actions, categories/rules, analytics, dashboard, budgets, subscriptions |
| Accounts/import | manual accounts, unified accounts, TrueLayer auth/callback/connections/sync/logs, statements upload/save/delete |
| Budget system | overview, day-to-day, alerts, upcoming, classify/approve, health score, event budgets, presets |
| Billing/revenue | packages, checkout, portal, status, cancel/resume, Stripe/Tyl notify/verify/config |
| AI/data tools | AI chat/history/providers/usage, insights, prices, investments, reports |
| Jewish/UK/SMS | Maaser, Tzedakah, holiday budgets, reports, UK calculators, SMS sender/inbox/save/report |
| Admin/platform | admin dashboard/users/flags/login history, settings, analytics, notifications, GDPR, support, empty states |

## Simulated Users
| User | End-to-end objective |
| --- | --- |
| New user | Register, complete onboarding path, connect/mock account, add transaction, create budget, reach useful dashboard |
| Returning daily user | Login, review dashboard, inspect transactions and budgets, respond to alert, check settings, logout |
| Power user | Rapid route switching, command palette, bulk actions, search/filter, repeated refresh, concurrent saves |
| Error-prone user | Invalid credentials, malformed amounts/dates, duplicate category, failed upload, API 401/403/404/429/500 |
| Mobile slow-network user | 360px navigation, skeletons, modals/sheets, forms/tables, no overlap, refresh/back/logout |

## Acceptance Gates
- `npm.cmd run build` passes in `frontend`.
- `npm.cmd run test:ci -- --runInBand` passes in `frontend`.
- `npm.cmd run test:e2e` passes after Playwright browsers are installed.
- `pytest -q` passes in `backend` on a Python-enabled environment.
- Hosted `/api/health` returns healthy or explicitly degraded with no crash.
